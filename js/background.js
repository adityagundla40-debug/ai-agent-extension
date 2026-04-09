chrome.runtime.onInstalled.addListener(() => {
  console.log("DoctorAI Extension Installed");
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.storage.local.get(['ollamaEndpoint', 'ollamaModel'], (res) => {
    if (!res.ollamaEndpoint) {
      chrome.storage.local.set({
        ollamaEndpoint: "http://localhost:11434",
        ollamaModel: "gemma3:4b"
      });
    }
  });
});

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('html/offscreen.html'),
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Capture microphone for ambient listening'
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_RECORDING") {
    console.log("Start recording requested.");
    sendResponse({ status: "Recording started in background" });
    return true;
  }

  if (message.action === "GET_TAB_STREAM_ID") {
    chrome.desktopCapture.chooseDesktopMedia(["tab", "screen", "audio"], (streamId) => {
      if (chrome.runtime.lastError || !streamId) {
        sendResponse({ streamId: null, error: chrome.runtime.lastError?.message || "Cancelled" });
      } else {
        sendResponse({ streamId });
      }
    });
    return true;
  }

  if (message.action === "START_AMBIENT_BROADCAST") {
    (async () => {
      await ensureOffscreen();
      // Get a stream ID via tabCapture that can be used in offscreen
      chrome.tabCapture.getMediaStreamId({}, (streamId) => {
        chrome.runtime.sendMessage({ action: 'START_AMBIENT_BROADCAST', streamId });
      });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === "STOP_AMBIENT_BROADCAST") {
    chrome.runtime.sendMessage({ action: 'STOP_AMBIENT_BROADCAST' });
    sendResponse({ success: true });
    return true;
  }

  // Forward ambient status from offscreen back to popup
  if (message.action === "AMBIENT_STATUS") {
    // broadcast to all extension pages (popup)
    chrome.runtime.sendMessage(message).catch(() => {});
    return false;
  }
  
  if (message.action === "CALL_OLLAMA") {
    (async () => {
      try {
        const body = {
          model: message.model,
          prompt: message.prompt,
          stream: false
        };
        if (message.imageBase64) {
          body.images = [message.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')];
        }

        const res = await fetch(`${message.endpoint}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://localhost'
          },
          body: JSON.stringify(body)
        });
        
        if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
        const data = await res.json();
        sendResponse({ success: true, response: data.response });
      } catch (err) {
        console.error("Ollama Error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async
  }

  if (message.action === "CALL_HF_VISION") {
    (async () => {
      try {
        // SmolVLM expects messages format with image_url
        const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${message.hfToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
            messages: [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: message.imageBase64 } },
                ...(message.imageBase64_2 ? [{ type: "image_url", image_url: { url: message.imageBase64_2 } }] : []),
                { type: "text", text: message.prompt }
              ]
            }],
            max_tokens: 500
          })
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HF Vision error: ${res.status} - ${text}`);
        }
        const data = await res.json();
        sendResponse({ success: true, response: data.choices[0].message.content });
      } catch (err) {
        console.error("HF Vision Error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === "GENERATE_IMAGE") {
    (async () => {
      try {
        const res = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${message.hfToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ inputs: message.prompt })
        });
        
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HF API error: ${res.status} - ${text}`);
        }
        
        const blob = await res.blob();
        // Convert blob to base64 to send back to popup
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, base64: reader.result });
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error("HF Error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open
  }
  
  if (message.action === "GET_QR_IMAGE") {
    (async () => {
      try {
        const res = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(message.data)}`);
        if (!res.ok) throw new Error("Failed to fetch QR");
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, base64: reader.result });
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
