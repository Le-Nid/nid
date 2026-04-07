# Analytics and Insights

Nid offers analysis tools to better understand your email habits and identify cleanup opportunities.

---

## Activity Heatmap

A heatmap visualizes your email activity on a **day of the week × hour of the day** grid. Each cell indicates the number of emails received during that time slot.

> 📸 *Suggested screenshot: activity heatmap with days as rows and hours as columns, colored from light blue to dark blue*

Use this view to:

- Identify your peak reception times (e.g., Monday morning, Tuesday 2 PM)
- Understand when you receive the most emails

---

## Clutter Scores

Each sender receives a **clutter score** calculated from:

- Number of emails sent
- Total email size
- Number of unread emails
- Read rate (read emails / total)
- Presence of an unsubscribe link

The higher the score, the more the sender "clutters" your mailbox.

> 📸 *Suggested screenshot: clutter scores table with sender, email count, size, read rate, and score columns*

---

## Cleanup Suggestions

Nid automatically generates **cleanup suggestions** based on the analysis of your emails:

| Suggestion Type | Description |
|---|---|
| **Bulk senders** | Senders who send many emails that are rarely read |
| **Large senders** | Senders whose emails take up a lot of space |
| **Old newsletters** | Newsletters unread for a long time |
| **Duplicate patterns** | Large numbers of similar emails |

Each suggestion indicates the number of affected emails and the reclaimable space.

> 📸 *Suggested screenshot: list of cleanup suggestions with type, description, and action buttons*

### Dismiss a Suggestion

If a suggestion is not relevant, click **Dismiss** to hide it. It won't reappear.

---

## Inbox Zero Tracker

The **Inbox Zero** tracker measures your progress toward an empty inbox:

- **Email count** in the inbox
- **Unread email count**
- **History**: chart showing the trend over time

> 📸 *Suggested screenshot: Inbox Zero chart showing the evolution of the email count in the inbox*

A snapshot is automatically recorded **every 6 hours** to feed the history.

---

## Weekly Report

Every **Monday**, a weekly report is automatically generated for each Gmail account:

- Number of emails received, archived, and deleted during the week
- Top senders of the week
- Rules executed and space freed
- Comparison with the previous week

The report is sent as an **in-app notification** and can be viewed from the **Insights** page.

> 📸 *Suggested screenshot: Insights page with the weekly report (summary figures + charts)*

---

## Analytics Cache

Analytics data is calculated on demand and cached for **15 minutes** in Redis for optimal performance.
