// Initialize GSAP ScrollTrigger
gsap.registerPlugin(ScrollTrigger);

document.addEventListener('DOMContentLoaded', () => {
    initializeAnimations();
    initializeNavigation();
    initializePricingToggle();
    initializeParallaxEffects();
    initializeIntersectionObserver();
    setupMobileMenu();
    initializeTrialButtons();
    initializeConversationSets();
    initializeAudioDemos();
});

// Navigation and Scroll Handling
function initializeNavigation() {
    const nav = document.getElementById('mainNav');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        // Add/remove background and shadow based on scroll position
        if (currentScroll > 50) {
            nav.classList.add('bg-white/95', 'shadow-md');
            nav.classList.remove('bg-white/80');
        } else {
            nav.classList.remove('bg-white/95', 'shadow-md');
            nav.classList.add('bg-white/80');
        }

        // Hide/show nav based on scroll direction
        if (currentScroll > lastScroll && currentScroll > 500) {
            nav.style.transform = 'translateY(-100%)';
        } else {
            nav.style.transform = 'translateY(0)';
        }
        lastScroll = currentScroll;
    });

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// GSAP Animations
function initializeAnimations() {
    // Hero section animations
    gsap.from('.hero-content > *', {
        opacity: 0,
        y: 30,
        duration: 1,
        stagger: 0.2,
        ease: 'power3.out'
    });

    // Feature cards animation
    gsap.utils.toArray('.feature-card').forEach((card, i) => {
        gsap.from(card, {
            scrollTrigger: {
                trigger: card,
                start: 'top bottom-=100',
                toggleActions: 'play none none reverse'
            },
            opacity: 0,
            y: 50,
            duration: 0.8,
            delay: i * 0.2
        });
    });

    // Technology stack animation
    gsap.from('.tech-stack img', {
        scrollTrigger: {
            trigger: '.tech-stack',
            start: 'top center+=100'
        },
        opacity: 0,
        y: 20,
        duration: 0.5,
        stagger: 0.1
    });
}

// Pricing Toggle
function initializePricingToggle() {
    const toggle = document.getElementById('billingToggle');
    
    if (toggle) {
        toggle.addEventListener('change', () => {
            const isAnnual = toggle.checked;
            
            document.querySelectorAll('[data-plan]').forEach(card => {
                const priceAmount = card.querySelector('.price-amount');
                const pricePeriod = card.querySelector('.price-period');
                const annualPrice = card.querySelector('.annual-price');
                const monthlyPrice = card.querySelector('.monthly-price');
                
                if (priceAmount && pricePeriod && annualPrice && monthlyPrice) {
                    if (isAnnual) {
                        priceAmount.textContent = annualPrice.textContent;
                        pricePeriod.textContent = '/year';
                    } else {
                        priceAmount.textContent = monthlyPrice.textContent;
                        pricePeriod.textContent = '/month';
                    }
                }
            });
        });
    }
}

// Parallax Effects
function initializeParallaxEffects() {
    document.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.parallax-card');
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const cardX = rect.left + rect.width / 2;
            const cardY = rect.top + rect.height / 2;

            const angleX = (mouseY - cardY) / 30;
            const angleY = (mouseX - cardX) / -30;

            card.style.transform = `perspective(1000px) rotateX(${angleX}deg) rotateY(${angleY}deg)`;
        });
    });
}

// Intersection Observer for Fade-in Effects
function initializeIntersectionObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
}

// Mobile Menu
function setupMobileMenu() {
    const menuButton = document.getElementById('mobileMenuButton');
    const mobileMenu = document.getElementById('mobileMenu');

    if (menuButton && mobileMenu) {
        menuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            // Add slide animation
            if (!mobileMenu.classList.contains('hidden')) {
                gsap.from(mobileMenu, {
                    height: 0,
                    opacity: 0,
                    duration: 0.3,
                    ease: 'power2.out'
                });
            }
        });
    }
}

// Language Switch Animation
function initializeLanguageSwitch() {
    const languages = [
        'English → Español',
        'Français → 日本',
        'Deutsche → 中文',
        'Русский → العربية'
    ];
    let currentIndex = 0;

    setInterval(() => {
        const demo = document.querySelector('.language-switch-demo');
        if (demo) {
            gsap.to(demo, {
                opacity: 0,
                y: -20,
                duration: 0.3,
                onComplete: () => {
                    currentIndex = (currentIndex + 1) % languages.length;
                    demo.textContent = languages[currentIndex];
                    gsap.to(demo, {
                        opacity: 1,
                        y: 0,
                        duration: 0.3
                    });
                }
            });
        }
    }, 3000);
}

// Call Demo Button Effect
function initializeCallButton() {
    const callButton = document.querySelector('.call-demo-btn');
    if (callButton) {
        callButton.addEventListener('mouseenter', () => {
            gsap.to(callButton, {
                scale: 1.05,
                duration: 0.3,
                ease: 'back.out(1.7)'
            });
        });

        callButton.addEventListener('mouseleave', () => {
            gsap.to(callButton, {
                scale: 1,
                duration: 0.3,
                ease: 'power2.out'
            });
        });
    }
}

// Initialize everything
window.addEventListener('load', () => {
    initializeLanguageSwitch();
    initializeCallButton();
    
    // Add smooth reveal for sections
    gsap.utils.toArray('section').forEach(section => {
        gsap.from(section, {
            scrollTrigger: {
                trigger: section,
                start: 'top 80%',
                toggleActions: 'play none none reverse'
            },
            opacity: 0,
            y: 50,
            duration: 1,
            ease: 'power3.out'
        });
    });
});

// Handle phone call
function handlePhoneCall() {
    window.location.href = 'tel:+13394997114';
}

// Add this to handle the FAQ section
function initializeFAQ() {
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            const icon = question.querySelector('i');
            
            // Toggle answer visibility
            gsap.to(answer, {
                height: answer.classList.contains('hidden') ? 'auto' : 0,
                duration: 0.3,
                ease: 'power2.inOut',
                onComplete: () => answer.classList.toggle('hidden')
            });
            
            // Rotate icon
            gsap.to(icon, {
                rotation: icon.style.transform.includes('180') ? 0 : 180,
                duration: 0.3
            });
        });
    });
}

// Initialize FAQ when document is ready
document.addEventListener('DOMContentLoaded', initializeFAQ);

// Update the trial button handlers
function initializeTrialButtons() {
    document.querySelectorAll('.pricing-card button').forEach(button => {
        button.addEventListener('click', () => {
            window.location.href = '/deploy';
        });
    });
}

// Add this function to handle conversation set transitions
function initializeConversationSets() {
    const sets = [
        {
            // English to Spanish
            user1: { text: "Hi, I'd like to book a room", lang: "English" },
            bot1: { text: "I'll help you with that. What dates are you looking for?", lang: "English" },
            user2: { text: "Prefiero continuar en español, del 15 al 20 de marzo", lang: "Spanish" },
            bot2: { text: "Perfecto. Tenemos habitaciones disponibles para esas fechas. ¿Qué tipo de habitación prefiere?", lang: "Spanish" }
        },
        {
            // French to Japanese
            user1: { text: "Bonjour, je voudrais réserver une chambre", lang: "French" },
            bot1: { text: "Je peux vous aider avec ça. Pour quelles dates?", lang: "French" },
            user2: { text: "日本語で続けてもいいですか？来週の木曜日からです", lang: "Japanese" },
            bot2: { text: "かしこまりました。何泊のご予定でしょうか？", lang: "Japanese" }
        },
        {
            // German to Chinese
            user1: { text: "Guten Tag, ich möchte ein Zimmer buchen", lang: "German" },
            bot1: { text: "Ich helfe Ihnen gerne. Für welches Datum?", lang: "German" },
            user2: { text: "我想用中文继续，下周二入住", lang: "Chinese" },
            bot2: { text: "好的，请问您想预订么类型的房间？", lang: "Chinese" }
        }
    ];

    let currentSetIndex = 0;
    const conversationContainer = document.querySelector('.conversation-sets');

    function updateConversation(setIndex) {
        const set = sets[setIndex];
        const messages = conversationContainer.querySelectorAll('.conversation-set p');
        const langs = conversationContainer.querySelectorAll('.text-white\\/60');
        
        // Update messages and languages with fade animation
        gsap.to(messages, { opacity: 0, duration: 0.3, onComplete: () => {
            messages[0].textContent = set.user1.text;
            messages[1].textContent = set.bot1.text;
            messages[2].textContent = set.user2.text;
            messages[3].textContent = set.bot2.text;
            
            langs[0].textContent = `${set.user1.lang} detected`;
            langs[1].textContent = `Speaking in ${set.user1.lang}`;
            langs[2].textContent = `${set.user2.lang} detected`;
            langs[3].textContent = `Speaking in ${set.user2.lang}`;
            
            gsap.to(messages, { opacity: 1, duration: 0.3 });
        }});
    }

    // Change conversation set every 8 seconds
    setInterval(() => {
        currentSetIndex = (currentSetIndex + 1) % sets.length;
        updateConversation(currentSetIndex);
    }, 8000);
}

// Audio Demo Functionality
function initializeAudioDemos() {
    const audioFiles = {
        'english-demo': {
            audio: '/audio/english-demo.mp3',
            captions: [
                {
                    start: 0,
                    end: 4.5,
                    text: "[System Initialization]",
                    speaker: "system"
                },
                {
                    start: 6.8,
                    end: 11.02,
                    text: "Hi, this is the AI receptionist of Hilton Edinburgh Carlton. How may I assist you today?",
                    speaker: "ai"
                },
                {
                    start: 12.04,
                    end: 12.8,
                    text: "Hi, how are you?",
                    speaker: "caller"
                },
                {
                    start: 16.84,
                    end: 21.3,
                    text: "Hello, I'm here and ready to assist you. How can I help you today? What's your name?",
                    speaker: "ai"
                },
                {
                    start: 22.32,
                    end: 25.28,
                    text: "My name is Rashid and do you have a deluxe room?",
                    speaker: "caller"
                },
                {
                    start: 25.28,
                    end: 41.2,
                    text: "Hello, Rashid. Yes, we do have deluxe rooms available at Hilton Edinburgh Carlton. Deluxe rooms offer extra space and amenities for a more comfortable stay. Would you like more information about the deluxe rooms or assistance with booking one?",
                    speaker: "ai"
                },
                {
                    start: 42.1,
                    end: 43.78,
                    text: "What's the cost for a night?",
                    speaker: "caller"
                },
                {
                    start: 47.36,
                    end: 55.26,
                    text: "The cost for a night in a deluxe room at Hilton Edinburgh Carlton is £180 for single occupancy or £200 for double occupancy.",
                    speaker: "ai"
                },
                {
                    start: 55.28,
                    end: 58.12,
                    text: "Would you like to proceed with booking a room?",
                    speaker: "ai"
                },
                {
                    start: 60.28,
                    end: 60.76,
                    text: "Yes.",
                    speaker: "caller"
                },
                {
                    start: 64.74,
                    end: 75.52,
                    text: "Great. I have sent you a booking link where you can complete your reservation for a deluxe room at Hilton Edinburgh Carlton. Enjoy your stay. Rashid, if you need any further assistance, feel free to ask.",
                    speaker: "ai"
                },
                {
                    start: 76.18,
                    end: 77.06,
                    text: "Alright, thank you. Bye.",
                    speaker: "caller"
                },
                {
                    start: 77.94,
                    end: 79.92,
                    text: "You're welcome. Have a wonderful day and goodbye.",
                    speaker: "ai"
                }
            ]
        },
        'finnish-demo': {
            audio: '/audio/finnish-demo.mp3',
            captions: [
                {
                    start: 0,
                    end: 7.22,
                    text: "Tervetuloa! Olen tekoälyn vastaanottovirkailija Hilton Edinburgh Carltonissa. Kuinka voin auttaa sinua tänään?",
                    speaker: "ai"
                },
                {
                    start: 7.94,
                    end: 8.58,
                    text: "Mitä kuuluu?",
                    speaker: "caller"
                },
                {
                    start: 10.3,
                    end: 14.12,
                    text: "Voin hyvin kiitos kysymästä. Kuinka voin auttaa sinua tänään?",
                    speaker: "ai"
                },
                {
                    start: 15.44,
                    end: 17.94,
                    text: "Mikä on yhden hengen Executive-huoneen hinta?",
                    speaker: "caller"
                },
                {
                    start: 20.08,
                    end: 27.16,
                    text: "Yhden hengen Executive-huoneen hinta on 2020 euroa per yö. Voinko auttaa sinua jossain muussa?",
                    speaker: "ai"
                },
                {
                    start: 27.16,
                    end: 31.1,
                    text: "Onko se saatavilla tämän kuun seitsemäspäivänä?",
                    speaker: "caller"
                },
                {
                    start: 33.52,
                    end: 43.24,
                    text: "Kyllä. Yhden hengen Executive-huone on saatavilla 7. heinäkuuta 2024. Haluatko varata sen vai tarvitsetko muuta tietoa?",
                    speaker: "ai"
                },
                {
                    start: 44.56,
                    end: 46.16,
                    text: "Haluaisin varata huoneen...",
                    speaker: "caller"
                },
                {
                    start: 48.04,
                    end: 51.16,
                    text: "Mahtavaa! Autan sinua varaamisen aloittamisessa.",
                    speaker: "ai"
                },
                {
                    start: 51.96,
                    end: 56.22,
                    text: "Tarvitsen joitakin tietoja varmistaakseni sujuvan varauksen.",
                    speaker: "ai"
                },
                {
                    start: 56.22,
                    end: 65.06,
                    text: "Koko nimi, sähköposti, puhelinnumero, erityistoiveet. Ole hyvä ja anna nämä tiedot, niin hoidan loput.",
                    speaker: "ai"
                },
                {
                    start: 67.04,
                    end: 69.26,
                    text: "Toki annan sinulle tarvittavat tiedot.",
                    speaker: "caller"
                },
                {
                    start: 69.74,
                    end: 75.38,
                    text: "Koko nimi Matti Virtanen. Sähköposti mattivirtanenexample.com.",
                    speaker: "caller"
                },
                {
                    start: 75.88,
                    end: 83.92,
                    text: "Puhelinnumero 0122-666-X-erityistoiveet. Ei mitään. Kiitos.",
                    speaker: "caller"
                },
                {
                    start: 83.92,
                    end: 83.96,
                    text: "Kiitos.",
                    speaker: "caller"
                },
                {
                    start: 86.22,
                    end: 88.92,
                    text: "Saat pian sähköpostin, joka sisältää varauksen tiedot.",
                    speaker: "ai"
                },
                {
                    start: 88.92,
                    end: 90.22,
                    text: "Jos tarvitset lisäapua, älä epäröi ottaa yhteyttä.",
                    speaker: "ai"
                },
                {
                    start: 90.22,
                    end: 99.0,
                    text: "Odotamme innolla ja toivkemme sinut tervetulleeksi Hilton Edinburgh Carlton hotelliin.",
                    speaker: "ai"
                },
                {
                    start: 99.0,
                    end: 107.58,
                    text: "Voinko auttaa sinua jossain muussa?",
                    speaker: "ai"
                },
                {
                    start: 107.58,
                    end: 108.34,
                    text: "Eipä kiitos, näkemiin!",
                    speaker: "caller"
                },
                {
                    start: 108.34,
                    end: 110.46,
                    text: "Eipä kestä, Matti. Toivon sinulle mukavaa oleskelua.",
                    speaker: "ai"
                },
                {
                    start: 116.22,
                    end: 119.46,
                    text: "Älä epäröi ottaa yhteyttä. Näkemiin!",
                    speaker: "ai"
                }
            ]
        },
        'arabic-demo': {
            audio: '/audio/arabic-demo.mp3',
            captions: [
                {
                    start: 0.16,
                    end: 8.0,
                    text: "مرحباً، أنا مساعد استقبال AI في فندقي هيلتون إدامبرت كارلتون. كيف يمكنني مساعدتك اليوم؟",
                    speaker: "ai"
                },
                {
                    start: 9.68,
                    end: 11.0,
                    text: "كيف حالك؟",
                    speaker: "caller"
                },
                {
                    start: 12.2,
                    end: 16.0,
                    text: "أنا بخير، شكراً لسؤالك. كيف يمكنني مساعدتك اليوم؟",
                    speaker: "ai"
                },
                {
                    start: 17.36,
                    end: 19.0,
                    text: "ما هو سعر غرفة Executive فردية؟",
                    speaker: "caller"
                },
                {
                    start: 22.4,
                    end: 29.0,
                    text: "سعر الغرفة التنفيذية الفردية هو 220 جنيه استرليني في الليلة.",
                    speaker: "ai"
                },
                {
                    start: 29.0,
                    end: 33.0,
                    text: "هل هناك أي شيء آخر يمكنني مساعدتك به؟",
                    speaker: "ai"
                },
                {
                    start: 34.04,
                    end: 37.0,
                    text: "هل هي متاحة في السابع من هذا الشهر؟",
                    speaker: "caller"
                },
                {
                    start: 40.24,
                    end: 46.26,
                    text: "نعم، الغرفة التنفيذية الفردية متاحة في السابع من يوليو 2024.",
                    speaker: "ai"
                },
                {
                    start: 47.02,
                    end: 50.0,
                    text: "هل تود حجزها أو تحتاج إلى معلومات أخرى؟",
                    speaker: "ai"
                },
                {
                    start: 51.36,
                    end: 53.42,
                    text: "أود المضي قدماً في الحجز.",
                    speaker: "caller"
                },
                {
                    start: 55.3,
                    end: 58.98,
                    text: "رائع، سأساعدك في بدء عملية الحجز.",
                    speaker: "ai"
                },
                {
                    start: 59.0,
                    end: 63.0,
                    text: "سأحتاج إلى بعض المعلومات لضمان إتمام الحجز بسلاسة.",
                    speaker: "ai"
                },
                {
                    start: 64.0,
                    end: 70.18,
                    text: "الاسم الكامل، البريد الإلكتروني، رقم الهاتف، أي طلبات خاصة.",
                    speaker: "ai"
                },
                {
                    start: 70.44,
                    end: 74.32,
                    text: "من فضلك قدم لي هذه المعلومات وسأكمل الباقي.",
                    speaker: "ai"
                },
                {
                    start: 75.58,
                    end: 78.34,
                    text: "بالتأكيد، اسمي أحمد محمد.",
                    speaker: "caller"
                },
                {
                    start: 78.92,
                    end: 83.94,
                    text: "يمكنك التواصل معي عبر البريد الإلكتروني أحمد.محمد.اتكزامبل.com",
                    speaker: "caller"
                },
                {
                    start: 83.94,
                    end: 88.12,
                    text: "ورقم هاتفي هو 0123456789.",
                    speaker: "caller"
                },
                {
                    start: 89.0,
                    end: 91.42,
                    text: "لا توجد لدي طلبات خاصة في الوقت الحالي.",
                    speaker: "caller"
                },
                {
                    start: 92.02,
                    end: 92.68,
                    text: "شكراً لك.",
                    speaker: "caller"
                },
                {
                    start: 94.52,
                    end: 96.96,
                    text: "شكراً لك على المعلومات، أحمد.",
                    speaker: "ai"
                },
                {
                    start: 97.32,
                    end: 99.12,
                    text: "سأقوم بإتمام حجزك الآن.",
                    speaker: "ai"
                },
                {
                    start: 99.54,
                    end: 100.7,
                    text: "تم تأكيد حجزك.",
                    speaker: "ai"
                },
                {
                    start: 101.1,
                    end: 105.66,
                    text: "ستتلقى رسالة بريد إلكتروني تحتوي على تفاصيل الحجز قريباً.",
                    speaker: "ai"
                },
                {
                    start: 106.06,
                    end: 110.8,
                    text: "إذا كنت بحاجة إلى أي مساعدة إضافية، فلا تتردد في التواصل.",
                    speaker: "ai"
                },
                {
                    start: 111.22,
                    end: 114.92,
                    text: "نتطلع للترحيب بك في فندق هيلتون إدنبرا كارلتون.",
                    speaker: "ai"
                },
                {
                    start: 114.92,
                    end: 118.92,
                    text: "هل هناك شيء آخر يمكنني مساعدتك به؟",
                    speaker: "ai"
                },
                {
                    start: 119.0,
                    end: 122.1,
                    text: "لا، شكراً.",
                    speaker: "caller"
                },
                {
                    start: 122.1,
                    end: 122.74,
                    text: "الله حافظ.",
                    speaker: "caller"
                }
            ]
        }
    };

    let currentAudio = null;
    let audioContext = null;
    let analyser = null;
    let animationFrameId = null;
    let visualizationActive = false;

    // Optimize audio bars creation
    function createAudioBars(container) {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 12; i++) { // Reduced from 20 to 12 bars
            const bar = document.createElement('div');
            bar.className = 'audio-bar bg-koko-600 w-1 mx-px transform transition-all duration-50';
            bar.style.height = '20%';
            fragment.appendChild(bar);
        }
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    // Optimize visualization
    function updateVisualization() {
        if (!analyser || !visualizationActive) return;

        const audioData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(audioData);

        const bars = document.querySelectorAll('.audio-visualizer .audio-bar');
        for (let i = 0; i < bars.length; i++) {
            const value = audioData[i * 4] / 255; // Sample every 4th value
            bars[i].style.height = `${value * 100}%`;
            bars[i].style.opacity = 0.5 + value * 0.5;
        }

        if (visualizationActive) {
            animationFrameId = requestAnimationFrame(updateVisualization);
        }
    }

    // Clean up resources
    function cleanupAudio() {
        if (currentAudio) {
            currentAudio.audio.pause();
            currentAudio.audio.src = '';
            currentAudio.audio.load();
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        visualizationActive = false;
        currentAudio = null;
    }

    // Handle play button click with optimizations
    document.querySelectorAll('.play-button').forEach(button => {
        const audioId = button.dataset.audio;
        const visualizer = button.querySelector('.audio-visualizer');
        const playIcon = button.querySelector('.play-icon');
        const progressBar = button.closest('.audio-card').querySelector('.audio-progress');
        
        createAudioBars(visualizer);

        button.addEventListener('click', async () => {
            if (currentAudio?.playing) {
                cleanupAudio();
                playIcon.classList.remove('hidden');
                visualizer.classList.add('hidden');
                progressBar.classList.add('hidden');
                return;
            }

            try {
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    analyser = audioContext.createAnalyser();
                    analyser.fftSize = 32; // Reduced from 64
                }

                const audioData = audioFiles[audioId];
                const audio = new Audio(audioData.audio);
                const source = audioContext.createMediaElementSource(audio);
                source.connect(analyser);
                analyser.connect(audioContext.destination);

                currentAudio = {
                    id: audioId,
                    audio,
                    playing: true,
                    button,
                    progressBar
                };

                playIcon.classList.add('hidden');
                visualizer.classList.remove('hidden');
                progressBar.classList.remove('hidden');

                audio.play();
                visualizationActive = true;
                updateVisualization();

                // Update progress bar less frequently
                let lastUpdate = 0;
                audio.addEventListener('timeupdate', () => {
                    const now = Date.now();
                    if (now - lastUpdate > 250) { // Update every 250ms
                        const progress = (audio.currentTime / audio.duration) * 100;
                        progressBar.querySelector('.progress-bar').style.width = `${progress}%`;
                        progressBar.querySelector('.current-time').textContent = formatTime(audio.currentTime);
                        lastUpdate = now;
                    }
                });

                audio.addEventListener('ended', () => {
                    cleanupAudio();
                    playIcon.classList.remove('hidden');
                    visualizer.classList.add('hidden');
                });

                // Initialize captions if available
                if (audioData.captions) {
                    const demoContainer = button.closest('.audio-card');
                    initializeCaptions(audio, audioData.captions, demoContainer);
                }

            } catch (error) {
                console.error('Audio playback error:', error);
                cleanupAudio();
            }
        });
    });

    // Clean up on page unload
    window.addEventListener('unload', cleanupAudio);
}

// Format time for audio player
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Update the initializeCaptions function for smoother transitions
function initializeCaptions(audio, captions, container) {
    const captionsContainer = document.createElement('div');
    captionsContainer.className = 'captions-container absolute bottom-16 left-0 right-0 p-4 overflow-hidden';
    container.appendChild(captionsContainer);

    let currentCaptionElement = null;
    let lastCaptionIndex = -1;

    function animateOutCaption(element) {
        return new Promise(resolve => {
            element.style.transition = 'all 0.5s ease-out';
            element.style.transform = 'translateY(-20px)';
            element.style.opacity = '0';
            
            setTimeout(() => {
                if (element.parentNode) {
                    element.remove();
                }
                resolve();
            }, 500);
        });
    }

    function createCaptionElement(caption) {
        const newCaption = document.createElement('div');
        newCaption.className = 'caption-text transform translate-y-full opacity-0 transition-all duration-500';
        
        const speakerClass = caption.speaker === 'ai' 
            ? 'text-koko-600' 
            : caption.speaker === 'caller'
            ? 'text-blue-600'
            : 'text-gray-500';
        
        const speakerIcon = caption.speaker === 'ai'
            ? '<i class="fas fa-robot mr-2"></i>'
            : caption.speaker === 'caller'
            ? '<i class="fas fa-user mr-2"></i>'
            : '<i class="fas fa-cog mr-2"></i>';

        newCaption.innerHTML = `
            <div class="bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-200">
                <div class="flex items-center ${speakerClass} text-sm mb-1">
                    ${speakerIcon}
                    <span>${caption.speaker === 'ai' ? 'AI Receptionist' : caption.speaker === 'caller' ? 'Caller' : 'System'}</span>
                </div>
                <p class="text-gray-800">${caption.text}</p>
            </div>
        `;

        return newCaption;
    }

    async function updateCaption(caption) {
        const newCaption = createCaptionElement(caption);
        
        // If there's a current caption, animate it out
        if (currentCaptionElement) {
            await animateOutCaption(currentCaptionElement);
        }

        // Add and animate in new caption
        captionsContainer.appendChild(newCaption);
        currentCaptionElement = newCaption;

        // Trigger animation in next frame
        requestAnimationFrame(() => {
            newCaption.style.transform = 'translateY(0)';
            newCaption.style.opacity = '1';
        });
    }

    audio.addEventListener('timeupdate', () => {
        const currentTime = audio.currentTime;
        
        // Find current caption
        const currentCaptionIndex = captions.findIndex(
            cap => currentTime >= cap.start && currentTime <= cap.end
        );

        // Only update if we have a new caption
        if (currentCaptionIndex !== -1 && currentCaptionIndex !== lastCaptionIndex) {
            lastCaptionIndex = currentCaptionIndex;
            updateCaption(captions[currentCaptionIndex]);
        }
    });

    // Clear captions when audio ends or pauses
    audio.addEventListener('ended', () => {
        if (currentCaptionElement) {
            animateOutCaption(currentCaptionElement);
            currentCaptionElement = null;
        }
        lastCaptionIndex = -1;
    });

    audio.addEventListener('pause', () => {
        if (currentCaptionElement) {
            animateOutCaption(currentCaptionElement);
            currentCaptionElement = null;
        }
        lastCaptionIndex = -1;
    });

    // Clear captions when audio seeks
    audio.addEventListener('seeking', () => {
        if (currentCaptionElement) {
            animateOutCaption(currentCaptionElement);
            currentCaptionElement = null;
        }
        lastCaptionIndex = -1;
    });
}
