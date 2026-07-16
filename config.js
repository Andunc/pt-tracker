// ---------------------------------------------------------------------
// PT Tracker configuration
// Fill these three values in, then reload the app. See README.md for
// step-by-step instructions on getting each one.
// ---------------------------------------------------------------------
window.PT_CONFIG = {
  // Google Cloud OAuth 2.0 "Web application" Client ID.
  // Looks like: 123456789-abc123xyz.apps.googleusercontent.com
  CLIENT_ID: "154964680567-ddan7i2qmphlvituflfj1ekab7l6mqlu.apps.googleusercontent.com",

  // The ID of the Google Sheet you're using as your data store.
  // Find it in the sheet's URL:
  // https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
  SHEET_ID: "1KhvPCkGHmgNLwmTogvVUAEFP70aTKBYCKJ03R-GvKj8",

  // What you owe Reach per completed session booked through them.
  REACH_RATE: 10,

  // Which Google Calendar "Add to Calendar" should create events on.
  // Leave as "primary" to use your main calendar, or paste in a specific
  // calendar's ID to use a dedicated one instead. Find a calendar's ID at
  // Google Calendar → Settings → (pick the calendar under "Settings for
  // my calendars") → "Integrate calendar" → Calendar ID.
  CALENDAR_ID: "5ee1caba5a4b78096269d33d5af93fe1ae758f31dae41800c8ae746b240f3a38@group.calendar.google.com"
};
