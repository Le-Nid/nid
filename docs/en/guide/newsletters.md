# Newsletters and Unsubscribing

Nid helps you identify the newsletters and mailing lists you're subscribed to, then clean them up in bulk.

---

## Scan for Newsletters

1. Open the **Newsletters** page in the sidebar
2. Click **Scan** on the Gmail account of your choice
3. A scan job is launched — it analyzes the `List-Unsubscribe` headers of your recent emails

> 📸 *Suggested screenshot: Newsletters page before the scan, with the Scan button*

---

## Detected Newsletters List

After the scan, Nid displays a list of all detected newsletters, showing for each:

- **Sender**: the newsletter's sending address
- **Email count**: how many emails you've received from this sender
- **Total size**: the space occupied by these emails

The list is sorted by email count in descending order, highlighting the most intrusive newsletters.

> 📸 *Suggested screenshot: list of detected newsletters with sender, email count, and size columns*

---

## View Emails from a Newsletter

Click on a sender to see the list of all emails received from that newsletter. This lets you review the content before deciding to clean up.

---

## Clean Up Newsletters

For each newsletter, two deletion options are available:

### Move to Trash

Moves all emails from this sender to Gmail's trash. Emails can be recovered for 30 days.

### Permanently Delete

Permanently deletes all emails from this sender. This action is **irreversible**.

> 📸 *Suggested screenshot: action buttons on a newsletter (Trash / Permanently Delete)*

::: tip Also unsubscribe from the sender
Nid detects newsletters but does not handle unsubscribing from the sender itself. Open the latest email from the newsletter and click the unsubscribe link at the bottom of the email to stop receiving new emails.
:::

---

## Best Practices

1. **Scan regularly** to detect new newsletters
2. **Start with trash** rather than permanent deletion
3. Combine with an **automatic rule** to automatically delete future emails from a newsletter (see [Rules](rules.md))
