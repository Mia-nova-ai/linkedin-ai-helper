# LinkedIn AI Profile Analyzer (Chrome Extension)

A productivity tool for Business Analysts and Recruiters to streamline professional networking.
Built with **Claude Code (CLI)**, **Chrome Extension Manifest V3**, and **Anthropic API**.

## 🚀 Key Features
*   **One-Click Extraction:** Instantly parses LinkedIn profile data (Name, About section) from the active tab.
*   **AI-Powered Analysis:** Uses LLM to analyze the candidate's DISC personality type.
*   **Smart Drafting:** Automatically generates hyper-personalized connection messages based on the profile context.
*   **BYOK Architecture:** "Bring Your Own Key" model ensures security. API keys are stored locally in the browser (`chrome.storage.local`) and never sent to a third-party server.

## 🛠️ Tech Stack
*   **Frontend:** HTML5, CSS3, Vanilla JavaScript
*   **Backend Logic:** Integration with Anthropic API (Direct call via Service Worker/Popup)
*   **Security:** Local Storage for credential management
*   **Dev Tool:** Accelerated development using **Claude Code (CLI)**

## 📦 How to Install (Developer Mode)
Since this is a portfolio project, it is not listed on the Chrome Web Store. You can install it locally:

1.  Download or Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **"Developer mode"** (top right toggle).
4.  Click **"Load unpacked"**.
5.  Select the project folder.

## 🔒 Privacy
This extension operates entirely client-side. No user data is collected or stored on external servers.

---
*Created by [Mia Zhang](https://www.linkedin.com/in/miazhang-techba) - Senior Technical BA & AI Application Engineer.*