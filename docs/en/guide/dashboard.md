# Dashboard

The Dashboard is the home page of Nid. It provides an overview of your Gmail mailbox with interactive charts.

---

## Overview

The Dashboard displays four statistics blocks, calculated in real time from the Gmail API:

> 📸 *Suggested screenshot: full Dashboard page with the 4 blocks*

---

## Top senders

A ranking of senders who send you the most emails, with two views:

- **By number of emails**: who floods your mailbox
- **By total size**: who uses the most space

This ranking is useful for quickly identifying senders to clean up or block.

> 📸 *Suggested screenshot: Top senders chart (horizontal bars)*

---

## Largest emails

List of the largest emails in your mailbox, sorted by decreasing size. Click on an email to open it and decide whether you want to delete or archive it.

Ideal for quickly freeing up space in your Gmail quota.

---

## Timeline

Line chart showing the evolution of emails received per month. Helps identify activity spikes and trends.

> 📸 *Suggested screenshot: Timeline chart (monthly curve)*

---

## Label distribution

Pie chart (or donut) showing the distribution of your Gmail labels. Useful for understanding how your emails are organized.

---

## Archive statistics

In addition to Gmail statistics, the Dashboard displays your local archive statistics:

- Number of archived emails
- Total archive size on the NAS
- Number of archived attachments

---

## Cache and refresh

Statistics are cached for 15 minutes in Redis to avoid overloading the Gmail API. The Dashboard always displays the most recent available data.

To force a refresh, reload the page.
