// Content script for DoctorAI
console.log("DoctorAI Content Script injected.");

// Useful for injecting UI or extracting data if we want to prompt the user directly on the page,
// or for reading the page structure for the "Url Summarizer" tool without using chrome.scripting from background.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_PAGE_TEXT") {
    // Extract readable text
    const text = document.body.innerText || "";
    sendResponse({ text: text });
  }
});
