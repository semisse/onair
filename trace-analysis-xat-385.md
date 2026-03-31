# XAT-385: Trace Analysis — "User should be able to move a single file using action toolbar"

## Test: `single-item-move.e2e.ts`

**Key files:**
- Test: `e2es/workspace-hxp-playwright/file-actions-e2e/src/tests/single-item-move.e2e.ts`
- Page object: `libs/playwright/workspace-hxp/content-services-extension/src/lib/page-object/pages/content-browser.page.ts`
- Dialog component: `libs/playwright/workspace-hxp/content-services-extension/src/lib/page-object/components/file-actions-dialog.component.ts`
- Document API: `libs/playwright/shared/src/api/services/content-service/document-service-api.ts`
- Group API: `libs/playwright/shared/src/api/services/content-service/group-service-api.ts`

---

## Test Setup (beforeEach, line 27)

Creates the following folder hierarchy via API:

```
Root: e2e-File Actions-*       (parentId: 00000000-..., system root)
├── e2e-sourceFolder-*         (child of root)
│   ├── e2e-testFolder-*       (child of source)
│   └── e2e-sample.pdf-*       (file, child of source)
└── e2e-targetFolder-*         (child of root)
```

- Root folder is created via `createFolderWithPermissions` (line 33), which calls `getGroupPermissions` → `getGroupId("hr")`
- Navigates to source folder (line 39)
- Waits for skeleton loader (line 40)

## Test Body (line ~64 onwards)

1. Select file checkbox → `performToolbarAction("Move")` (line 64)
2. In move dialog: navigate up via breadcrumb back button (line 65)
3. Select target folder and confirm move (via `FileActionDialog.performAction`)
4. Assert toast: `"File has been moved"` (line 68)
5. Navigate to moved file by document ID (line 70)
6. Assert PDF viewer visible: `hxp-document-viewer adf-pdf-viewer` (line 72)

## Cleanup (afterEach, line 43)

- Gets breadcrumb array and asserts file is under target folder
- Deletes root folder

---

## Trace 1: Auth Token Expiry (400 invalid_grant)

| Property | Value |
|---|---|
| **Failure point** | Line 72 — `expect(locator('hxp-document-viewer adf-pdf-viewer')).toBeVisible()` |
| **Error** | Test timeout 45000ms exceeded |
| **Root cause** | OAuth token expired mid-test (`400 invalid_grant` from `auth.iam.dev.experience.hyland.com/idp/connect/token`) |
| **Move succeeded?** | Yes — toast appeared, afterEach breadcrumb assertion passed |
| **Category** | Infrastructure flakiness (auth) |

**Details:** Token had 57s remaining at start. After the move completed (~32s in), navigating to the file's document page triggered a token refresh that failed. The page couldn't load the file.

---

## Trace 2: Backend 500 on Group API

| Property | Value |
|---|---|
| **Failure point** | Line 33 (beforeEach) — `createFolderWithPermissions` |
| **Error** | `AxiosError: Request failed with status code 500` |
| **Root cause** | `GET /api/group?name=hr` returned `500 Internal Server Error` |
| **Move succeeded?** | Never reached — test setup failed |
| **Category** | Infrastructure flakiness (backend) |

**Details:** The content service backend was returning 500 on the group lookup API. No folders or files were created. Test duration: ~1.3s.

---

## Trace 3: 403 Forbidden After Move (POTENTIALLY REAL BUG)

| Property | Value |
|---|---|
| **Failure point** | Line 72 — `expect(locator('hxp-document-viewer adf-pdf-viewer')).toBeVisible()` |
| **Error** | `403 Forbidden` — `Privilege 'Read' is not granted to 'bbc4a5fb-...' on document 'f8822575-...'` |
| **Move succeeded?** | Yes — toast `"File has been moved"` appeared |
| **Category** | **Permissions bug or test setup issue** |

**Details:**
- Setup completed successfully, all folders created
- Move operation completed (toast confirmed)
- Navigating to the moved file returned **403 Forbidden**
- The API explicitly says the test user (`bbc4a5fb-...`) lacks `Read` privilege on the moved file

**Investigation needed:**

1. **Check `single-item-move.e2e.ts` lines 27-42** — Does `createFolderWithPermissions` get called for ALL folders (root, source, target) or just the root? If only the root, child folders rely on inheritance.

2. **Check `document-service-api.ts` line 94** — What permissions does `createFolderWithPermissions` set? Is inheritance enabled?

3. **Check target folder creation** — Is it using `createFolderWithPermissions` or a simpler `createFolder` without explicit permissions?

4. **Check backend move behavior** — When a file is moved, does the backend:
   - Preserve the file's original ACLs? (would explain the issue if source folder had explicit grants)
   - Reset to inherit from the new parent? (would work IF the target folder has correct permissions)
   - Strip inherited permissions without re-inheriting? (this would be the bug)

**Most likely fix options:**
- Ensure the **target folder** has explicit Read permissions for the test user during setup
- OR fix the backend to correctly inherit permissions from the target folder after a move

---

## Summary

| Trace | Failed At | Error | Root Cause |
|---|---|---|---|
| 1 | Line 72 (post-move verify) | Timeout (400 invalid_grant) | Token expired — infra |
| 2 | Line 33 (setup) | 500 Internal Server Error | Group API down — infra |
| 3 | Line 72 (post-move verify) | 403 Forbidden | **Permissions issue — needs investigation** |

Trace 3 is the actionable one. Traces 1 and 2 are environment instability.
