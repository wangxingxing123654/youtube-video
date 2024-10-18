require('dotenv').config();
const { google } = require('googleapis');
const moment = require('moment');

const sheets = google.sheets({ version: 'v4' });
const youtube = google.youtube({ version: 'v3' });

async function authorize() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/youtube.force-ssl']
  });
  return auth.getClient();
}

async function getVideoIds(auth) {
  const response = await sheets.spreadsheets.values.get({
    auth,
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${process.env.INPUT_SHEET_NAME}!A2:A`,
  });

  return response.data.values.map(row => {
    const url = row[0];
    const videoId = url.split('v=')[1] || url.split('/').pop();
    return videoId.split('&')[0]; // Remove any additional parameters
  });
}

async function getVideoStats(auth, videoId) {
  const response = await youtube.videos.list({
    auth,
    part: 'statistics,snippet',
    id: videoId,
  });

  if (response.data.items.length === 0) {
    return null;
  }

  const video = response.data.items[0];
  return {
    title: video.snippet.title,
    viewCount: parseInt(video.statistics.viewCount, 10),
    date: moment().format('YYYY-MM-DD'),
  };
}

async function updateSpreadsheet(auth, data) {
  const values = data.map(item => [item.title, item.viewCount, item.date]);
  await sheets.spreadsheets.values.append({
    auth,
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${process.env.OUTPUT_SHEET_NAME}!A:C`,
    valueInputOption: 'USER_ENTERED',
    resource: { values },
  });
}

async function main() {
  try {
    const auth = await authorize();
    const videoIds = await getVideoIds(auth);
    const videoStats = await Promise.all(
      videoIds.map(async (videoId) => await getVideoStats(auth, videoId))
    );
    const validStats = videoStats.filter(stat => stat !== null);
    await updateSpreadsheet(auth, validStats);
    console.log('Spreadsheet updated successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();