# QuranAI

A simple Quran app built for reading, saving verses, and asking for guidance based on Quranic themes. It has a clean mobile-first layout, a reading view for all 114 surahs, and a small AI layer that looks up relevant verses and gives short explanations.

This started as a personal project to make Quran reading feel more personal and easier to use on the phone. The app is built with Expo for the frontend and a small Node server for the AI layer.

## Requirements

- Node.js 20+
- Anthropic API key for the AI search

## Setup

```bash
# install everything
npm run setup

# copy the example env file and add your API key
cp server/.env.example server/.env
# then open server/.env and add:
# ANTHROPIC_API_KEY=your_key_here

# launch both the server and Expo app
npm start
```

If you are using Expo on your phone, make sure your phone and computer are on the same Wi-Fi network. For the browser, the app is usually opened through the Expo web terminal.

## Features

- Full Quran surah list
- Arabic + English verse view
- Save verses for later
- Search by topic or feeling
- AI-based verse suggestions for questions and moods
- Continue reading history

## Project structure

```bash
server/index.js   backend API and AI agent logic
app/App.js       Expo app UI and logic
app/index.js     app entry point
```

## Notes

The app gets Quran text from the public Quran API and keeps the AI layer separate from the frontend. The server is where the Anthropic key lives, so the app itself does not need the key.

This is a personal project and it is still being shaped as I use it more in real life. I am keeping the code straightforward and easy to change.
