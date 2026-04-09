document.addEventListener('DOMContentLoaded', () => {

  // --- Navigation Logic ---
  const mainGrid = document.getElementById('mainGrid');
  const viewsContainer = document.getElementById('viewsContainer');
  const backNav = document.getElementById('backNav');
  const backBtn = document.getElementById('backBtn');
  const viewTitle = document.getElementById('viewTitle');
  const cards = document.querySelectorAll('.card');
  const settingsBtn = document.getElementById('settingsBtn');

  function showView(targetId, title) {
    mainGrid.classList.remove('active');
    viewsContainer.classList.add('active');
    backNav.classList.remove('hidden');
    viewTitle.textContent = title;

    document.querySelectorAll('.child-view').forEach(v => v.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');
  }

  function goBack() {
    mainGrid.classList.add('active');
    backNav.classList.add('hidden');
    document.querySelectorAll('.child-view').forEach(v => v.classList.remove('active'));
  }

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const target = card.getAttribute('data-target');
      const title = card.querySelector('h3').textContent;
      showView(target, title);
    });
  });

  backBtn.addEventListener('click', goBack);
  settingsBtn.addEventListener('click', () => showView('view-settings', 'Settings'));

  // --- Reusable Voice Input for all mic buttons ---
  document.querySelectorAll('.voice-input-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!('webkitSpeechRecognition' in window)) {
        alert("Speech recognition not supported in this browser.");
        return;
      }
      const targetId = btn.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      const original = btn.textContent;

      const recognition = new webkitSpeechRecognition();
      recognition.lang = 'en-US';
      recognition.start();
      btn.textContent = btn.classList.contains('icon-only') ? '🔴' : '🔴 Listening...';
      btn.disabled = true;

      recognition.onresult = (e) => {
        targetEl.value = e.results[0][0].transcript;
        btn.textContent = original;
        btn.disabled = false;
      };
      recognition.onerror = recognition.onend = () => {
        btn.textContent = original;
        btn.disabled = false;
      };
    });
  });


  // --- Settings Manager ---
  const elOllamaEndpoint = document.getElementById('ollamaEndpoint');
  const elOllamaModel = document.getElementById('ollamaModel');
  const elHfToken = document.getElementById('hfToken');

  chrome.storage.local.get(['ollamaEndpoint', 'ollamaModel', 'hfToken'], (res) => {
    if (res.ollamaEndpoint) elOllamaEndpoint.value = res.ollamaEndpoint;
    if (res.ollamaModel) elOllamaModel.value = res.ollamaModel;
    if (res.hfToken) elHfToken.value = res.hfToken;
  });

  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    chrome.storage.local.set({
      ollamaEndpoint: elOllamaEndpoint.value,
      ollamaModel: elOllamaModel.value,
      hfToken: elHfToken.value
    }, () => {
      const fb = document.getElementById('settingsFeedback');
      fb.classList.remove('hidden');
      setTimeout(() => fb.classList.add('hidden'), 2000);
    });
  });

  // --- Helper: Call Local Ollama ---
  async function callOllama(prompt, imageBase64 = null) {
    const { ollamaEndpoint, ollamaModel } = await chrome.storage.local.get(['ollamaEndpoint', 'ollamaModel']);
    const endpoint = ollamaEndpoint || 'http://localhost:11434';
    const model = ollamaModel || 'gemma3:4b';
    
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "CALL_OLLAMA",
        endpoint,
        model,
        prompt,
        imageBase64
      }, (response) => {
        if (!response || !response.success) {
          console.error(response ? response.error : "Unknown error");
          resolve(`Error connecting to local AI: ${response ? response.error : "Is Ollama running?"}`);
        } else {
          resolve(response.response);
        }
      });
    });
  }


  // --- 1. Voice Command ---
  const startVoiceBtn = document.getElementById('startVoiceBtn');
  const voiceTranscript = document.getElementById('voiceTranscript');
  const voiceResponse = document.getElementById('voiceResponse');
  const voiceStatus = document.getElementById('voiceStatus');

  startVoiceBtn.addEventListener('click', () => {
    if (!('webkitSpeechRecognition' in window)) {
      voiceStatus.textContent = "Speech API not supported";
      return;
    }
    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'en-US';
    recognition.start();
    
    voiceStatus.textContent = "Listening...";
    voiceTranscript.textContent = "...";
    voiceResponse.textContent = "";

    recognition.onresult = async (event) => {
      const text = event.results[0][0].transcript;
      voiceTranscript.textContent = `You: ${text}`;
      voiceStatus.textContent = "Processing logic...";
      
      // Basic local processing logic
      const lower = text.toLowerCase();

      // Map of voice keywords to URLs
      const siteMap = {
        'youtube': 'https://youtube.com',
        'github': 'https://github.com',
        'google': 'https://google.com',
        'twitter': 'https://twitter.com',
        'facebook': 'https://facebook.com',
        'reddit': 'https://reddit.com',
        'gmail': 'https://mail.google.com',
        'netflix': 'https://netflix.com',
        'instagram': 'https://instagram.com',
        'linkedin': 'https://linkedin.com',
        'stackoverflow': 'https://stackoverflow.com',
        'stack overflow': 'https://stackoverflow.com',
        'wikipedia': 'https://wikipedia.org',
        'amazon': 'https://amazon.com',
      };

      const openMatch = lower.match(/^open\s+(.+)$/);
      if (openMatch) {
        const siteName = openMatch[1].trim();
        const url = siteMap[siteName] || `https://${siteName.replace(/\s+/g, '')}.com`;
        chrome.tabs.create({ url });
        voiceResponse.textContent = `Jarvis: Opening ${siteName}.`;
      } else if (lower.includes("search for")) {
        const query = lower.split("search for")[1].trim();
        chrome.tabs.create({ url: `https://google.com/search?q=${encodeURIComponent(query)}` });
        voiceResponse.textContent = `Jarvis: Searching for ${query}.`;
      } else {
        voiceResponse.textContent = "Jarvis: Thinking...";
        const aiReply = await callOllama(`User gave voice command: "${text}". Decide what to do or give a short reply.`);
        voiceResponse.textContent = `Jarvis: ${aiReply}`;
      }
      voiceStatus.textContent = "Ready to listen";
    };
  });


  // --- 2. Screen Capture ---
  let currentScreenshot = null;
  document.getElementById('captureScreenBtn').addEventListener('click', () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      currentScreenshot = dataUrl;
      const img = document.getElementById('captureImg');
      img.src = dataUrl;
      document.getElementById('screenshotPreview').classList.remove('hidden');
    });
  });

  document.getElementById('askScreenBtn').addEventListener('click', async () => {
    const query = document.getElementById('screenQuery').value || "Describe exactly what you see on screen, including all visible text, UI elements, and their content.";
    const respBox = document.getElementById('screenResponse');
    if (!currentScreenshot) {
      respBox.textContent = "Please capture screen first.";
      return;
    }

    const { hfToken } = await chrome.storage.local.get('hfToken');
    if (!hfToken) {
      respBox.textContent = "Please save your HuggingFace token in Settings first.";
      return;
    }

    // If a second image is captured, send both for comparison
    const images = [currentScreenshot];
    if (compareScreenshot) images.push(compareScreenshot);

    const prompt = compareScreenshot
      ? `Compare these two screenshots and answer: ${query || "What are the differences between these two images?"}`
      : query;

    respBox.textContent = compareScreenshot ? "Comparing images with Llama 4 Scout..." : "Analyzing with Llama 4 Scout Vision...";
    chrome.runtime.sendMessage({
      action: "CALL_HF_VISION",
      hfToken,
      prompt,
      imageBase64: currentScreenshot,
      imageBase64_2: compareScreenshot || null
    }, (response) => {
      respBox.textContent = !response || !response.success ? `Error: ${response ? response.error : "Unknown"}` : response.response;
    });
  });

  // --- Compare Image Capture ---
  let compareScreenshot = null;
  document.getElementById('compareImagesBtn').addEventListener('click', () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      compareScreenshot = dataUrl;
      const img = document.getElementById('compareImg');
      img.src = dataUrl;
      document.getElementById('comparePreview').classList.remove('hidden');
      document.getElementById('compareImagesBtn').textContent = "Recapture Second Image";
    });
  });


  // --- 4. Math Solver ---
  document.getElementById('solveMathBtn').addEventListener('click', async () => {
    const input = document.getElementById('mathInput').value;
    const respBox = document.getElementById('mathResult');
    if (!input) return;
    respBox.textContent = "Solving securely offline...";
    const prompt = `Solve this math problem step-by-step in clear, logical sequence: ${input}`;
    const reply = await callOllama(prompt);
    respBox.textContent = reply;
  });


  // --- 5. URL Summarizer ---
  document.getElementById('summarizeUrlBtn').addEventListener('click', () => {
    const respBox = document.getElementById('summaryResult');
    respBox.textContent = "Fetching tab content...";
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0].id;
      // Inject script to extract text
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => document.body.innerText.substring(0, 5000) // First 5000 chars
      }, async (results) => {
        if (results && results[0]) {
          const text = results[0].result;
          respBox.textContent = "Summarizing locally...";
          const reply = await callOllama(`Summarize the following web page content accurately and concisely:\n\n${text}`);
          respBox.textContent = reply;
        }
      });
    });
  });

  document.getElementById('summarizeCustomBtn').addEventListener('click', async () => {
    const url = document.getElementById('summaryUrlInput').value;
    const respBox = document.getElementById('summaryResult');
    if (!url) return;
    respBox.textContent = "I can only read current tabs due to CORS natively. Open it and click 'Summarize Current Tab'. (Or we can proxy it in background).";
  });


  // --- 8. Image Generation (Hugging Face) ---
  document.getElementById('generateImageBtn').addEventListener('click', async () => {
    const prompt = document.getElementById('imagePrompt').value;
    const { hfToken } = await chrome.storage.local.get('hfToken');
    const resultBox = document.getElementById('imageResult');
    const genImg = document.getElementById('generatedImg');
    
    if (!hfToken) {
      alert("Please save your Hugging Face API Token in settings first!");
      return;
    }
    if (!prompt) return;

    genImg.alt = "Generating...";
    resultBox.classList.remove('hidden');

    try {
      chrome.runtime.sendMessage({
        action: "GENERATE_IMAGE",
        hfToken,
        prompt
      }, (response) => {
        if (!response || !response.success) {
          alert(`Error generating image: ${response ? response.error : 'Unknown'}`);
          resultBox.classList.add('hidden');
          return;
        }
        
        genImg.src = response.base64;
        document.getElementById('downloadImageBtn').onclick = () => {
          const a = document.createElement('a');
          a.href = response.base64;
          a.download = 'generated_image.png';
          a.click();
        };
      });
    } catch (e) {
      console.error(e);
      alert("Error generating image.");
    }
  });


  // --- 3. Music Finder (Shazam via RapidAPI) ---
  let mediaRecorder = null;
  let audioChunks = [];
  let musicRecording = false;

  document.getElementById('startMusicBtn').addEventListener('click', async () => {
    const resultBox = document.getElementById('musicResult');
    const btn = document.getElementById('startMusicBtn');

    if (musicRecording) {
      mediaRecorder.stop();
      musicRecording = false;
      btn.textContent = "Start Listening";
      resultBox.textContent = "Processing audio...";
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks, { type: 'audio/webm' });

        resultBox.textContent = "Identifying song...";
        try {
          const res = await fetch('http://localhost:8080/api/identify-music', {
            method: 'POST',
            headers: { 'Content-Type': 'audio/webm' },
            body: blob
          });
          const data = await res.json();

          if (data.success) {
            resultBox.innerHTML = `
              ${data.coverart ? `<img src="${data.coverart}" style="width:80px;border-radius:8px;margin-bottom:8px"><br>` : ''}
              <strong>${data.title}</strong><br>
              Artist: ${data.artist}<br>
              Album: ${data.album}<br>
              Released: ${data.released}
            `;
          } else {
            resultBox.textContent = `Not recognized: ${data.error}. Try again with clearer audio.`;
          }
        } catch (err) {
          resultBox.textContent = "Error: Make sure ambient_server.py is running (python ambient_server.py).";
        }
      };

      mediaRecorder.start();
      musicRecording = true;
      btn.textContent = "Stop & Identify";
      resultBox.textContent = "Listening... play or hum the song, then click Stop.";

      setTimeout(() => {
        if (musicRecording && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
          musicRecording = false;
          btn.textContent = "Start Listening";
        }
      }, 10000);

    } catch (err) {
      resultBox.textContent = "Microphone access denied. Please allow mic permission.";
    }
  });

  // --- 6. Ambient Listening ---
  document.getElementById('startAmbientBtn').addEventListener('click', async () => {
    const qrcodeBox = document.getElementById('qrcodeBox');
    const statusText = document.getElementById('ambientStatus');
    const btn = document.getElementById('startAmbientBtn');

    statusText.textContent = "Starting tunnel... please wait (up to 30s)";
    btn.disabled = true;

    // Poll until tunnel is ready
    let tunnelUrl = null;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch('http://localhost:8080/api/tunnel');
        const data = await res.json();
        if (data.url) { tunnelUrl = data.url; break; }
      } catch (e) {
        statusText.textContent = "Error: Run 'py -3.11 ambient_server.py' first!";
        btn.disabled = false;
        return;
      }
      await new Promise(r => setTimeout(r, 1000));
      statusText.textContent = `Waiting for tunnel... (${i + 1}s)`;
    }

    if (!tunnelUrl) {
      statusText.textContent = "Tunnel timed out. Restart ambient_server.py and try again.";
      btn.disabled = false;
      return;
    }

    // Show QR code
    chrome.runtime.sendMessage({ action: "GET_QR_IMAGE", data: tunnelUrl }, (response) => {
      if (response && response.success) {
        qrcodeBox.innerHTML = `<img src="${response.base64}" alt="QR" style="width:150px;border-radius:8px;">`;
      }
    });
    statusText.textContent = "Scan QR on phone, then click Start Broadcasting";
    btn.disabled = false;
    btn.textContent = "Start Broadcasting";
    btn.onclick = startBroadcasting;

    // Listen for status updates
    chrome.runtime.onMessage.addListener(function ambientListener(msg) {
      if (msg.action === 'AMBIENT_STATUS') {
        if (msg.status === 'broadcasting') {
          statusText.textContent = `Broadcasting! Scan QR on phone to connect.`;
          btn.textContent = "Stop Broadcasting";
          btn.disabled = false;
          btn.onclick = () => {
            chrome.runtime.sendMessage({ action: 'STOP_AMBIENT_BROADCAST' });
            btn.textContent = "Start Broadcasting";
            btn.onclick = startBroadcasting;
            statusText.textContent = "Stopped.";
          };
        } else if (msg.status === 'connected') {
          statusText.textContent = "📱 Phone connected! Streaming mic audio...";
        } else if (msg.status === 'mic_denied') {
          statusText.textContent = "Mic denied in offscreen. Check chrome://settings/content/microphone";
          btn.disabled = false;
        } else if (msg.status === 'error') {
          statusText.textContent = `Error: ${msg.message}. Try again.`;
          btn.disabled = false;
        }
      }
    });

    function startBroadcasting() {
      // Open broadcaster page in a new tab — it has real mic access as a webpage
      chrome.tabs.create({ url: 'http://localhost:8080/broadcast' });
      statusText.textContent = "Broadcaster tab opened. Allow mic when prompted, then scan QR on phone.";
    }
  });

  // --- 7. Screen Recording (real tab capture) ---
  let isRecording = false;
  let screenRecorder = null;
  let screenChunks = [];
  let recordingCount = 0;

  document.getElementById('startRecordBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('recordStatus');
    statusEl.textContent = "Requesting capture...";

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60 },
        audio: true
      });

      screenChunks = [];
      screenRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });

      screenRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) screenChunks.push(e.data);
      };

      screenRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(screenChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        recordingCount++;
        const name = `Capture_${String(recordingCount).padStart(3, '0')}.webm`;

        const li = document.createElement('li');
        li.style.cssText = 'margin-top:10px;list-style:none;';
        li.innerHTML = `
          🎥 ${name}
          <a href="${url}" download="${name}" style="margin-left:8px;color:#a78bfa;">Download</a>
          <br>
          <video src="${url}" controls style="width:100%;margin-top:6px;border-radius:8px;"></video>
        `;
        document.getElementById('recordingsList').appendChild(li);

        statusEl.textContent = "Recording saved.";
        document.getElementById('startRecordBtn').disabled = false;
        document.getElementById('stopRecordBtn').disabled = true;
        document.querySelector('.record-indicator').classList.remove('recording');
        isRecording = false;
      };

      // Stop recording if user closes the browser's share dialog
      stream.getVideoTracks()[0].onended = () => {
        if (screenRecorder && screenRecorder.state !== 'inactive') screenRecorder.stop();
      };

      screenRecorder.start();
      isRecording = true;
      document.querySelector('.record-indicator').classList.add('recording');
      statusEl.textContent = "Recording...";
      document.getElementById('startRecordBtn').disabled = true;
      document.getElementById('stopRecordBtn').disabled = false;

    } catch (err) {
      statusEl.textContent = err.name === 'NotAllowedError' ? "Permission denied or cancelled." : `Error: ${err.message}`;
    }
  });

  document.getElementById('stopRecordBtn').addEventListener('click', () => {
    if (screenRecorder && screenRecorder.state !== 'inactive') {
      screenRecorder.stop();
      document.getElementById('recordStatus').textContent = "Processing...";
    }
  });

});
