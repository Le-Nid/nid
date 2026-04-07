# Administration

The **Administration** page is restricted to users with the **admin** role. It allows you to manage users, monitor jobs, and view system statistics.

---

## User Management

### User List

The table displays all users on the instance with:

- Email, display name, avatar
- Role (user / admin)
- Number of connected Gmail accounts
- Storage space used
- Last sign-in date
- Status (active / inactive)

The list is paginated and supports searching by email or name.

> 📸 *Suggested screenshot: user table with the columns mentioned above*

### Edit a User

Click on a user to modify:

- **Role**: promote to admin or demote to user
- **Quotas**:
    - Maximum number of Gmail accounts (default: 5)
    - Archive storage quota (default: 1 GB)
- **Status**: enable or disable the account

> 📸 *Suggested screenshot: user edit form with role, quotas, and status fields*

---

## Global Jobs

The **Jobs** tab displays jobs from **all users** with:

- The user who launched the job
- The type and status
- The progress
- The creation date

Administrators can cancel any running job.

---

## System Statistics

The **Statistics** tab displays:

- Total number of users
- Number of connected Gmail accounts
- Total storage space used
- Number of running jobs

> 📸 *Suggested screenshot: admin dashboard with system statistics*

---

## Integrity Check

Administrators can verify the consistency between EML files on the NAS and the PostgreSQL index:

- **Missing files**: referenced in the database but absent from disk
- **Orphan files**: present on disk without a database record
- **Corrupted files**: empty files (0 bytes)

The check can be launched manually or runs automatically **every night at 3 AM**. If an issue is found, an `integrity.failed` webhook event is triggered.

> 📸 *Suggested screenshot: integrity check result (healthy status / issues detected)*
