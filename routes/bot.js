const express = require('express');
const router = express.Router();
const { ServicesClient } = require('@google-cloud/run').v2;
const monitoring = require('@google-cloud/monitoring');
const Bot = require('../models/Bot');
const { protect } = require('../middleware/auth');

// Initialize clients
const runClient = new ServicesClient({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

const monitoringClient = new monitoring.MetricServiceClient({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

// Add this utility function at the top
function normalizeServiceName(name) {
    // Remove project ID suffix if it exists
    return name.replace(/-\d+$/, '');
}

// Get all bots for a user
router.get('/bots', protect, async (req, res) => {
    try {
        const bots = await Bot.find({ user: req.user._id });
        
        console.log('\n=== DATABASE BOTS ===');
        bots.forEach(bot => {
            console.log(`Name: ${bot.name}`);
            console.log(`Service URL: ${bot.serviceUrl}`);
            console.log(`Deployment Name: ${bot.deploymentName}`);
            console.log('-------------------');
        });

        // List Cloud Run services
        try {
            const parent = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/asia-south1`;
            const [services] = await runClient.listServices({ parent });
            
            console.log('\n=== CLOUD RUN SERVICES ===');
            services.forEach(service => {
                console.log(`Name: ${service.name.split('/').pop()}`);
                console.log(`URI: ${service.uri}`);
                console.log('-------------------');
            });

            // Compare deployments
            console.log('\n=== DEPLOYMENT ANALYSIS ===');
            const cloudRunServiceNames = services.map(s => s.name.split('/').pop());
            const botDeploymentNames = bots.map(b => b.deploymentName);
            
            console.log('\nMissing from Cloud Run:');
            botDeploymentNames.forEach(name => {
                if (!cloudRunServiceNames.includes(name)) {
                    console.log(`- ${name}`);
                }
            });

            console.log('\nNot linked to any bot:');
            cloudRunServiceNames.forEach(name => {
                if (!botDeploymentNames.includes(name)) {
                    console.log(`- ${name}`);
                }
            });
            console.log('======================\n');

        } catch (error) {
            console.error('\nError listing Cloud Run services:', error.message);
        }

        res.json(bots);
    } catch (error) {
        console.error('Error fetching bots:', error);
        res.status(500).json({ message: 'Error fetching bots' });
    }
});

// Get bot details including Cloud Run status
router.get('/bots/:id', protect, async (req, res) => {
    try {
        const bot = await Bot.findOne({ _id: req.params.id, user: req.user._id });
        if (!bot) {
            return res.status(404).json({ message: 'Bot not found' });
        }

        // Ensure credentials are included in the response
        const botData = bot.toJSON();
        console.log('Sending bot data:', botData);  // Add this line for debugging

        res.json(botData);
    } catch (error) {
        console.error('Error fetching bot details:', error);
        res.status(500).json({ message: 'Error fetching bot details' });
    }
});

// Get bot status
router.get('/bots/:id/status', protect, async (req, res) => {
    try {
        const bot = await Bot.findOne({ _id: req.params.id, user: req.user._id });
        if (!bot) {
            return res.status(404).json({ message: 'Bot not found' });
        }

        console.log('Getting status for bot:', bot.deploymentName);

        const [status, metrics] = await Promise.all([
            getCloudRunServiceStatus(bot.deploymentName),
            getServiceMetrics(bot.deploymentName)
        ]);

        // Add additional context to the response
        const response = {
            status,
            metrics,
            deploymentName: bot.deploymentName,
            normalizedName: normalizeServiceName(bot.deploymentName),
            serviceUrl: bot.serviceUrl,
            isMock: bot.serviceUrl.includes('mock-url'),
            lastChecked: new Date().toISOString(),
            bot: {
                name: bot.name,
                type: bot.type,
                createdAt: bot.createdAt
            }
        };

        console.log('Status response:', response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching bot status:', error);
        res.status(500).json({ 
            message: 'Error fetching bot status',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Get bot metrics
router.get('/bots/:id/metrics', protect, async (req, res) => {
    try {
        const bot = await Bot.findOne({ _id: req.params.id, user: req.user._id });
        if (!bot) {
            return res.status(404).json({ message: 'Bot not found' });
        }

        const metrics = await getServiceMetrics(bot.deploymentName);
        res.json(metrics);
    } catch (error) {
        console.error('Error fetching bot metrics:', error);
        res.status(500).json({ message: 'Error fetching bot metrics' });
    }
});

// Get bot logs
router.get('/bots/:id/logs', protect, async (req, res) => {
    try {
        const bot = await Bot.findOne({ _id: req.params.id, user: req.user._id });
        if (!bot) {
            return res.status(404).json({ message: 'Bot not found' });
        }

        const logs = await getServiceLogs(bot.deploymentName);
        res.json(logs);
    } catch (error) {
        console.error('Error fetching bot logs:', error);
        res.status(500).json({ message: 'Error fetching bot logs' });
    }
});

// Helper functions for Cloud Run monitoring
async function getCloudRunServiceStatus(serviceName) {
    try {
        if (!serviceName) {
            console.warn('Service name is undefined');
            return {
                state: 'UNKNOWN',
                error: 'Service name not found'
            };
        }

        // Handle mock deployments
        if (serviceName.includes('mock-url')) {
            return {
                state: 'MOCK',
                error: 'Mock deployment - no actual service'
            };
        }

        // Extract base name without project ID and remove any duplicate segments
        const baseNameMatch = serviceName.match(/^([^-]+(?:-[^-]+)*?)(?:-\d+)?$/);
        const baseName = baseNameMatch ? baseNameMatch[1] : serviceName;
        
        console.log('Checking service:', {
            original: serviceName,
            normalized: baseName
        });

        const parent = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/asia-south1`;
        
        try {
            // First try exact match
            const name = `${parent}/services/${baseName}`;
            const [service] = await runClient.getService({ name });

            return {
                state: service.terminal ? 'STOPPED' : 
                       service.latest_ready_revision ? 'RUNNING' : 'DEPLOYING',
                url: service.uri,
                lastTransitionTime: service.update_time,
                latestCreatedRevision: service.latest_created_revision,
                latestReadyRevision: service.latest_ready_revision,
                traffic: service.traffic,
                resources: {
                    cpu: service.template?.resources?.cpu_limit,
                    memory: service.template?.resources?.memory_limit
                },
                observedGeneration: service.observed_generation,
                conditions: service.conditions,
                creator: service.creator,
                lastModifier: service.lastModifier
            };
        } catch (error) {
            if (error.code === 5) { // NOT_FOUND error
                // Try to find service with partial name match
                const [services] = await runClient.listServices({ parent });
                
                // Look for a service that starts with the base name
                const matchingService = services.find(s => {
                    const svcName = s.name.split('/').pop();
                    return svcName.startsWith(baseName.split('-')[0]);
                });

                if (matchingService) {
                    console.log('Found matching service:', matchingService.name);
                    return {
                        state: 'MISMATCHED',
                        error: 'Service exists with different name',
                        actualName: matchingService.name.split('/').pop(),
                        url: matchingService.uri,
                        lastTransitionTime: matchingService.update_time,
                        latestCreatedRevision: matchingService.latest_created_revision,
                        latestReadyRevision: matchingService.latest_ready_revision
                    };
                }

                // If no matching service found, it was likely deleted or never deployed
                return {
                    state: 'NOT_FOUND',
                    error: 'Service not found in Cloud Run. It may have been deleted or was never deployed.'
                };
            }
            throw error;
        }
    } catch (error) {
        console.error('Error getting Cloud Run service status:', error);
        return {
            state: 'ERROR',
            error: error.message
        };
    }
}

// Add this new function to list all services
async function listCloudRunServices() {
    try {
        const parent = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/asia-south1`;
        
        // Using the listServices method
        const iterable = await runClient.listServicesAsync({
            parent: parent
        });

        const services = [];
        for await (const service of iterable) {
            services.push(service);
        }

        return services;
    } catch (error) {
        console.error('Error listing Cloud Run services:', error);
        throw error;
    }
}

async function getServiceMetrics(serviceName) {
    try {
        // Handle mock deployments
        if (serviceName.includes('mock-url')) {
            return {
                metrics: {
                    requestCount: null,
                    requestLatencies: null,
                    containerMemoryUtilization: null,
                    containerCpuUtilization: null
                },
                timestamp: Math.floor(Date.now() / 1000),
                period: '1h',
                isMock: true
            };
        }

        const normalizedName = normalizeServiceName(serviceName);
        const projectId = process.env.GOOGLE_CLOUD_PROJECT;
        const now = Math.floor(Date.now() / 1000);
        const oneHourAgo = now - 3600;

        // Base request object
        const baseRequest = {
            name: monitoringClient.projectPath(projectId),
            interval: {
                startTime: { seconds: oneHourAgo },
                endTime: { seconds: now }
            },
            view: 'FULL'
        };

        console.log('Getting metrics for service:', normalizedName);

        // Define metric requests with correct aligners for each metric type
        const metricRequests = [
            {
                key: 'requestCount',
                filter: `resource.type = "cloud_run_revision" AND 
                        resource.labels.service_name = "${normalizedName}" AND 
                        metric.type = "run.googleapis.com/request_count"`,
                aggregation: {
                    alignmentPeriod: { seconds: 300 },
                    perSeriesAligner: 'ALIGN_DELTA',  // Changed from ALIGN_SUM
                    crossSeriesReducer: 'REDUCE_SUM'
                }
            },
            {
                key: 'requestLatencies',
                filter: `resource.type = "cloud_run_revision" AND 
                        resource.labels.service_name = "${normalizedName}" AND 
                        metric.type = "run.googleapis.com/request_latencies"`,
                aggregation: {
                    alignmentPeriod: { seconds: 300 },
                    perSeriesAligner: 'ALIGN_PERCENTILE_99'  // Changed from ALIGN_PERCENTILE_95
                }
            },
            {
                key: 'containerMemoryUtilization',
                filter: `resource.type = "cloud_run_revision" AND 
                        resource.labels.service_name = "${normalizedName}" AND 
                        metric.type = "run.googleapis.com/container/memory/utilizations"`,
                aggregation: {
                    alignmentPeriod: { seconds: 300 },
                    perSeriesAligner: 'ALIGN_DELTA',  // Changed from ALIGN_MEAN
                    crossSeriesReducer: 'REDUCE_MEAN'
                }
            },
            {
                key: 'containerCpuUtilization',
                filter: `resource.type = "cloud_run_revision" AND 
                        resource.labels.service_name = "${normalizedName}" AND 
                        metric.type = "run.googleapis.com/container/cpu/utilizations"`,
                aggregation: {
                    alignmentPeriod: { seconds: 300 },
                    perSeriesAligner: 'ALIGN_DELTA',  // Changed from ALIGN_MEAN
                    crossSeriesReducer: 'REDUCE_MEAN'
                }
            }
        ];

        // Make separate requests for each metric
        const metrics = {};
        for (const request of metricRequests) {
            try {
                console.log(`Fetching metric: ${request.key} with aligner: ${request.aggregation.perSeriesAligner}`);
                const [timeSeries] = await monitoringClient.listTimeSeries({
                    ...baseRequest,
                    filter: request.filter,
                    aggregation: request.aggregation
                });

                metrics[request.key] = processMetricData(timeSeries, request.key);
                console.log(`Successfully fetched ${request.key} data:`, metrics[request.key]);
            } catch (error) {
                console.error(`Error fetching ${request.key}:`, error);
                metrics[request.key] = null;
            }
        }

        return {
            metrics,
            timestamp: now,
            period: '1h'
        };
    } catch (error) {
        console.error('Error getting service metrics:', error);
        return {
            error: error.message,
            metrics: null
        };
    }
}

// Update processMetricData to handle different metric types
function processMetricData(timeSeries, metricKey) {
    if (!timeSeries || timeSeries.length === 0) {
        console.log(`No time series data received for ${metricKey}`);
        return null;
    }

    console.log(`Processing ${metricKey} data with ${timeSeries.length} series`);

    // Process based on metric type
    const processedData = timeSeries.map(series => {
        const points = series.points || [];
        console.log(`Processing ${points.length} points for series:`, series.metric?.type);

        const values = points.map(point => {
            let value;
            if (point.value.distributionValue) {
                // Handle distribution values
                value = point.value.distributionValue.mean || 0;
            } else {
                value = point.value.doubleValue || point.value.int64Value || 0;
            }

            return {
                value,
                timestamp: point.interval.endTime,
                labels: series.metric?.labels || {}
            };
        });

        return {
            metric: series.metric?.type,
            resource: series.resource?.labels,
            values: values
        };
    });

    // Add metric-specific processing
    switch (metricKey) {
        case 'requestCount':
            const total = processedData.reduce((sum, series) => 
                sum + series.values.reduce((s, v) => s + v.value, 0), 0);
            return {
                total,
                series: processedData,
                average: total / (processedData.length || 1)
            };
        
        case 'requestLatencies':
            const allLatencies = processedData.flatMap(series => 
                series.values.map(v => v.value));
            return {
                average: allLatencies.reduce((a, b) => a + b, 0) / (allLatencies.length || 1),
                p99: allLatencies.sort((a, b) => a - b)[Math.floor(allLatencies.length * 0.99)] || 0,
                series: processedData
            };
        
        default:
            return {
                series: processedData,
                average: processedData.reduce((sum, series) => 
                    sum + series.values.reduce((s, v) => s + v.value, 0), 0) / 
                    (processedData.reduce((count, series) => count + series.values.length, 0) || 1)
            };
    }
}

async function getServiceLogs(serviceName) {
    // Placeholder for now - will implement log retrieval later
    return [];
}

module.exports = router;
