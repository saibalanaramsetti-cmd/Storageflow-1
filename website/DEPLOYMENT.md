# 🚀 StorageFlow 2.0 Website — Zero-Cost Deployment Guide

This guide walks you through deploying the StorageFlow download website and hosting the Windows `.exe` installer **100% free forever** with zero hosting bills.

---

## Architecture Overview (Zero Cost Stack)

| Component | Provider | Cost | Benefit |
| :--- | :--- | :--- | :--- |
| **Website Hosting** | **GitHub Pages** or **Vercel** | **$0 / month** | Global Edge CDN, Free SSL, Unlimited Visitors |
| **Download Installer Hosting** | **GitHub Releases** | **$0 / month** | Up to 2 GB per file, high-speed Microsoft Azure CDN downloads |
| **Domain (Optional)** | `yourname.github.io` or `vercel.app` | **$0 / month** | Free subdomain included |

---

## Option 1: Deploy on GitHub Pages (Recommended — 2 Minutes)

GitHub Pages hosts static websites directly from your repository for free.

### Step 1: Enable GitHub Pages in your Repository
1. Open your GitHub repository in your browser:  
   👉 `https://github.com/saibalanaramsetti-cmd/Storageflow-1`
2. Click **Settings** (gear icon on the top menu).
3. In the left sidebar, click **Pages** (under "Code and automation").
4. Under **Build and deployment**:
   - **Source**: Select `Deploy from a branch`.
   - **Branch**: Select `main`.
   - **Folder**: Select `/website` (or `/docs`).
5. Click **Save**.

> Within 1-2 minutes, GitHub will publish your site live at:  
> **`https://saibalanaramsetti-cmd.github.io/Storageflow-1/`**

---

## Option 2: Deploy on Vercel (1-Click Global CDN)

Vercel provides ultra-fast global edge caching with zero configuration.

### Steps:
1. Go to [vercel.com](https://vercel.com) and click **Sign Up** with your GitHub account.
2. Click **Add New...** &rarr; **Project**.
3. Select your repository: `Storageflow-1`.
4. In the Project Setup screen:
   - **Root Directory**: Click "Edit" and choose `website`.
   - **Framework Preset**: Other / None.
5. Click **Deploy**.

> In 15 seconds, Vercel gives you a live production URL like:  
> **`https://storageflow.vercel.app`** with automatic HTTPS! Every time you `git push`, Vercel automatically updates your site.

---

## How to Host Your `.exe` Installer for Free on GitHub Releases

Your landing page's download button links to:
`https://github.com/saibalanaramsetti-cmd/Storageflow-1/releases/latest/download/StorageFlow-Setup.exe`

Here is how to create the release so users can download it with 1 click:

### Step 1: Create a New Release
1. Open your repository: `https://github.com/saibalanaramsetti-cmd/Storageflow-1`
2. In the right sidebar, click **Releases** &rarr; **Draft a new release**.
3. In **Choose a tag**, type: `v2.0.0` (and click *Create new tag*).
4. Release title: `StorageFlow 2.0 — Universal Windows Edition`.
5. Under **Attach binaries by dropping them here or selecting them**:
   - Drag and drop your installer `.exe` from your PC:
     `c:\Users\saiba\OneDrive\Desktop\storage flow\dist-package\StorageFlow-Setup.exe`
     *(Rename or upload as `StorageFlow-Setup.exe` so the direct link works immediately).*
6. Click **Publish release**.

Users clicking "Download Free" on your website will now download your Windows app directly from GitHub's global high-speed servers with zero bandwidth cost to you!
