# Outlook Calendar Alarms on iPhone via iOS Shortcuts

Set up automatic alarms that go off **5 minutes before** every Outlook calendar event, using the built-in iOS Shortcuts app.

---

## Prerequisites

Your Outlook calendar must be synced to the native iOS Calendar app. If you only use the Outlook app, iOS Shortcuts can't see your events.

### Sync Outlook Calendar to iOS Calendar

1. Open **Settings** on your iPhone
2. Tap **Calendar** > **Calendar Accounts** (or on older iOS: **Mail** > **Accounts**)
3. Tap **Add Account** > **Microsoft Exchange** (for work/school) or **Outlook.com** (for personal)
4. Sign in with your Microsoft/Outlook credentials
5. Make sure **Calendars** is toggled **ON**
6. Tap **Save**

Your Outlook events should now appear in the iOS Calendar app. Give it a minute to sync.

---

## Option A: Automatic Notification Before Every Event (Simplest)

This uses a **Shortcuts Automation** that fires automatically before each calendar event. No manual trigger needed.

### Steps

1. Open the **Shortcuts** app on your iPhone
2. Tap the **Automation** tab at the bottom
3. Tap the **+** button in the top-right corner
4. Select **Calendar** from the list of triggers
5. Configure the trigger:
   - **Event**: tap and choose your **Outlook calendar** (it will be listed under whatever name it synced as, e.g. "Outlook" or your email address)
   - **Alert Time**: select **5 minutes before**
   - You can leave "Any Event" selected, or filter to specific calendars
6. Tap **Next**
7. Add the action **Show Notification**:
   - Tap **Add Action**
   - Search for **"Show Notification"**
   - Tap it to add it
   - For the notification body, tap the text field and insert the **Calendar Event** variable (tap "Calendar Event" from the variable suggestions). This will show the event title
   - Optionally set the **Title** to something like "Meeting in 5 min"
8. Tap **Next**
9. **Turn OFF** "Ask Before Running" so it fires automatically
10. Tap **Done**

### Result

You'll get an iOS notification 5 minutes before every Outlook calendar event. The notification will show the event name.

---

## Option B: Actual Alarm Sound Before Every Event

If you want a **loud alarm** (like the Clock app alarm) rather than a silent notification, this approach creates a real alarm.

### Steps

1. Open the **Shortcuts** app
2. Tap the **Automation** tab
3. Tap **+** > **Calendar**
4. Configure:
   - Select your **Outlook calendar**
   - Set to **10 minutes before** (we set it earlier because we'll create the alarm inside the shortcut, and we want the alarm to ring at the 5-minute mark)
5. Tap **Next**
6. Add the action **Create Alarm**:
   - Tap **Add Action**
   - Search for **"Create Alarm"**
   - For the time, use a **Date** action first:
     - Add an **"Adjust Date"** action
     - Set it to: **Add 5 minutes** to **Current Date** (this means the alarm fires 5 minutes after the automation runs, which is 5 minutes before the event since the automation triggers at 10 minutes before)
   - Set the alarm time to the result of Adjust Date
   - Set **Name** to the Calendar Event title
7. Tap **Next**
8. Turn OFF "Ask Before Running"
9. Tap **Done**

### Result

A real alarm will be created in the Clock app that rings 5 minutes before each event.

> **Note:** iOS will ask you to confirm alarms the first few times. After consistent use, it runs automatically.

---

## Option C: Shortcut That Scans All Upcoming Events (Advanced)

If you want more control, you can build a Shortcut that scans your calendar and creates alarms for all events in the next 24 hours at once.

### Build the Shortcut

1. Open **Shortcuts** > tap **+** to create a new shortcut
2. Name it **"Set Outlook Alarms"**
3. Add these actions in order:

| # | Action | Configuration |
|---|--------|---------------|
| 1 | **Find Calendar Events** | Start Date: Current Date, End Date: Adjust Date (+1 day), Calendar: your Outlook calendar |
| 2 | **Repeat with Each** | Select the calendar events from step 1 |
| 3 | **Adjust Date** (inside repeat) | Subtract 5 minutes from **Repeat Item** (Start Date) |
| 4 | **Create Alarm** (inside repeat) | Time: result of step 3, Name: Repeat Item (Title) |
| 5 | **End Repeat** | |

### Automate It

To run this automatically every morning:

1. Go to **Automation** tab
2. Tap **+** > **Time of Day**
3. Set to a time like **7:00 AM**
4. Set to run **Daily**
5. Tap **Next**
6. Choose **Run Shortcut** and select "Set Outlook Alarms"
7. Turn OFF "Ask Before Running"
8. Tap **Done**

### Result

Every morning at 7 AM, the shortcut scans your Outlook calendar for the day's events and creates alarms for each one, set to go off 5 minutes before each event.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **Shortcut can't see Outlook events** | Make sure Outlook is synced to iOS Calendar (see Prerequisites above) |
| **Automation doesn't fire** | Check that "Ask Before Running" is OFF. Also check Settings > Shortcuts > Advanced > "Allow Running Scripts" is ON |
| **Notifications are silent** | Check Settings > Notifications > Shortcuts. Make sure notifications are allowed with Sounds ON |
| **"Create Alarm" not available** | This action requires iOS 17 or later. Update your iPhone if needed |
| **Duplicate alarms** | Option C can create duplicate alarms if run multiple times. Consider adding a "Delete Alarm" step at the beginning to clear old alarms first |

## Tips

- **Do Not Disturb**: Alarms from the Clock app will ring even in Do Not Disturb mode. Notifications from Option A will NOT
- **All-day events**: To skip all-day events in Option C, add an **If** action inside the Repeat loop: `If Repeat Item (Is All Day) is No`, then create the alarm
- **Multiple calendars**: You can create separate automations for different Outlook calendars (work, personal, etc.)
- **Outlook app default reminders**: The Outlook app itself has a notification setting under Outlook > Settings > Notifications > Reminders. However, these are just push notifications and can be unreliable. The Shortcuts approach above is more dependable
