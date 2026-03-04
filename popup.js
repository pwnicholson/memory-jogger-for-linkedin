// Handle opening the options page
document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
