---
title: feedbackbot
emoji: 🚀
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# 🤖 Feedback Bot: Mission Control

A high-performance, resilient automation suite designed for the IUSMS feedback portal. Engineered with a premium gold-and-black aesthetic, multi-user session isolation, and deterministic submission logic.

## 🚀 Key Features

- **🎯 Precision Execution**: Deterministic alert-based confirmation system for 100% submission reliability.
- **📱 Responsive Uplink**: Mobile-optimized dashboard with a live remote-view window.
- **🛰️ Multi-Session Core**: Powered by `AsyncLocalStorage` to handle multiple concurrent users via IP-based isolation.
- **⚡ High-Speed Protocols**: Optimized navigation and form handling with sub-300ms inter-subject delays.
- **💎 Ultra-Smooth Stream**: 25FPS live remote view with dynamic click-scaling and low-latency JPEG compression.
- **🔋 Resource Optimized**: Fully utilizes 16GB RAM overhead with allocated 8GB Node.js heap and hardware-accelerated Chromium flags.
- **📊 Mission Reports**: Detailed post-run summaries including success rates, duplicates, and category breakdowns.

## 🛠️ Deployment Protocols

### Hugging Face Space (Backend Core)
The primary backend is hosted as a Docker Space.
1. Configure **Secrets** in your HF Space (PORT: 7860).
2. The Dockerfile is pre-configured to handle Puppeteer dependencies and port mapping.

### Vercel (Frontend Uplink)
The dashboard is a Next.js application designed to connect to the backend SSE stream.
1. Connect your GitHub repository to Vercel.
2. Set `NEXT_PUBLIC_BACKEND_URL` to your HF Space's direct URL.

## 📡 Port Configuration
The system is configured to listen on **Port 7860** by default for Hugging Face compatibility.

---
*Created with the Advanced Agentic Coding suite.*
