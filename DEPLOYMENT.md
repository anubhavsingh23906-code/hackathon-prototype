# Deployment Guide

This project uses fake seeded demo data. Do not configure MongoDB for the hackathon demo.

## Recommended Hosting

- Frontend: Vercel
- Backend: Render
- Source code: GitHub

The frontend and backend run as two hosted services. They work together because the frontend calls the backend URL through `VITE_API_URL`.

## Demo Accounts

```text
Patient: patient@test.com / 123456
Driver: driver@test.com / 123456
```

## Local Run

```powershell
npm.cmd run stop:ports
npm.cmd run dev
```

Frontend:

```text
http://localhost:5173
```

Backend health:

```text
http://localhost:8080/api/health
```

## Backend On Render

Create a Render **Web Service** from the GitHub repo.

Settings:

```text
Root Directory: server
Build Command: npm install
Start Command: npm start
```

Environment variables:

```text
JWT_SECRET=make-this-long-and-random
CLIENT_URL=https://your-vercel-frontend.vercel.app
```

Do not add `MONGODB_URI`. If `MONGODB_URI` is missing, the backend automatically uses fake JSON/in-memory demo data.

After deploy, test:

```text
https://your-render-backend.onrender.com/api/health
```

## Frontend On Vercel

Create a Vercel project from the same GitHub repo.

Settings:

```text
Root Directory: client
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Environment variable:

```text
VITE_API_URL=https://your-render-backend.onrender.com
```

After adding this environment variable, redeploy the frontend.

## Deployment Order

1. Push the complete project to GitHub.
2. Deploy backend on Render.
3. Copy the Render backend URL.
4. Deploy frontend on Vercel.
5. Add `VITE_API_URL` in Vercel.
6. Add `CLIENT_URL` in Render.
7. Redeploy both.
8. Test patient login, driver login, request creation, realtime accept, and expanded map.
