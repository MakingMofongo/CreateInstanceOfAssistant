const assert = require('assert');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const { clone } = require('../cloner');
const path = require('path');
const fs = require('fs');

describe('Local Deployment Test', function() {
    this.timeout(300000); // 5 minutes timeout
    let testFolderName;
    let containerName;

    before(function(done) {
        testFolderName = clone('test_assistant_id');
        console.log(`Created test folder: ${testFolderName}`);
        containerName = `test-container-${Date.now()}`;
        done();
    });

    after(function(done) {
        // Clean up: stop and remove the Docker container, and remove the test folder
        exec(`docker stop ${containerName} && docker rm ${containerName}`, (error) => {
            if (error) console.error(`Error cleaning up container: ${error}`);
            fs.rm(path.join(__dirname, '..', testFolderName), { recursive: true, force: true }, (error) => {
                if (error) console.error(`Error removing test folder: ${error}`);
                done();
            });
        });
    });

    it('should build and run the Docker container successfully', function(done) {
        const dockerfilePath = path.join(__dirname, '..', testFolderName);
        
        // Build the Docker image
        exec(`docker buildx build -t test-image "${dockerfilePath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error building Docker image: ${error}`);
                return done(error);
            }
            console.log('Docker image built successfully');

            // Run the Docker container
            exec(`docker run -d --name ${containerName} -p 8080:8080 -e PORT=8080 test-image`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error running Docker container: ${error}`);
                    return done(error);
                }
                console.log('Docker container started successfully');

                // Wait for the container to start up
                setTimeout(() => {
                    // Check container logs
                    exec(`docker logs ${containerName}`, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`Error fetching container logs: ${error}`);
                        } else {
                            console.log('Container logs:', stdout);
                            console.error('Container error logs:', stderr);
                        }

                        // Check if the container is still running and get more details
                        exec(`docker inspect ${containerName}`, (error, stdout, stderr) => {
                            if (error) {
                                console.error(`Error inspecting container: ${error}`);
                            } else {
                                const inspectData = JSON.parse(stdout)[0];
                                console.log('Container state:', inspectData.State);
                                console.log('Container network settings:', inspectData.NetworkSettings);
                            }

                            // Test if the application is responding
                            fetch('http://localhost:8080')
                                .then(res => res.text())
                                .then(body => {
                                    assert(body.includes('Server is running'), 'Application should be running and responding');
                                    done();
                                })
                                .catch(error => {
                                    console.error(`Error fetching from container: ${error}`);
                                    done(error);
                                });
                        });
                    });
                }, 5000); // Wait 5 seconds for the container to start
            });
        });
    });
});