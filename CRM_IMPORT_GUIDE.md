# Memory Jogger CRM Import Guide

This guide shows you how to export contact data from popular CRMs and convert it into a format that Memory Jogger can import.

## Expected Import Format

Memory Jogger expects a JSON file with this structure:

```json
{
  "/in/john-doe": "Met at TechCon 2024. Worked on ML project.",
  "/in/jane-smith-12345678": "Referred by Sarah. Looking to hire engineers.",
  "/in/bob-johnson": "Former colleague at Acme Corp. Still interested in partnerships."
}
```

**Important:** Profile keys must:
- Start with `/in/`
- Contain the LinkedIn URL slug (everything after `/in/` in the profile URL)
- Include any numeric IDs if they're part of the LinkedIn URL
- Support special characters (including URL-encoded characters like `%E2%9A%A1`)


### Step 1: Export info from your CRM

---

## HubSpot

1. Go to **Contacts** in HubSpot
2. Click the checkbox to select all contacts (or filter first)
3. Click **Actions** → **Export**
4. Choose:
   - Format: **CSV**
   - If possible, export using UTF-8 character set
   - Include: First Name, Last Name, LinkedIn Profile URL, Custom Notes Field (if you have one)
5. Click **Export** and save the file

---

## Salesforce

1. Go to **Contacts** or **Accounts** module
2. Click the **List View**
3. Click **⋮ (More)** → **Export to CSV** (or use **Reports**)
   - If possible, export using UTF-8 character set
4. Include fields:
   - Contact Name / Account Name
   - LinkedIn Profile URL (if stored in a custom field)
   - Custom Notes/Description field
5. Download the CSV

---

## Zoho

1. Go to **Contacts** in Zoho CRM
2. Click the **⋮ Menu** → **Export**
3. Choose:
   - Format: **CSV** with UTF-8 character set
   - Fields: First Name, Last Name, LinkedIn, Notes (or your custom notes field)
4. Download the CSV

---

### Step 2: Convert to Memory Jogger Format Using Google Sheets

1. Import your HubSpot CSV into Google Sheets
2. Create a formula in a helper column to combine fields:
   ```
   =/in/" & REGEXEXTRACT(C2, "/in/([^/?#]+)") & "|" & (IF(E2="", CONCATENATE(A2, " from ", D2), E2))
   ```
   - C2 = LinkedIn URL
   - E2 = Notes field
   - A2 = First Name
   - D2 = Company
3. Copy the helper column, paste as values
4. Use a JSON formatter extension to convert to the proper format

---

## Validation Checklist

Before importing, ensure your JSON:

- ✅ Is valid JSON (use [jsonlint.com](https://jsonlint.com) to check)
- ✅ All keys start with `/in/`
- ✅ All values are strings (note text)
- ✅ No special characters except in URLs (those are fine)
- ✅ Notes are under 200 characters (recommended)

**Example of valid JSON:**
```json
{
  "/in/john-doe": "Met at conference",
  "/in/jane-smith-98765": "Referred by Paul",
  "/in/zap%E2%9A%A1%EF%B8%8F": "Emoji in username test"
}
```

---

## Troubleshooting

**"Import failed - Invalid entries"**
- Check that all profile keys start with `/in/`
- Ensure no missing Note fields (notes can be blank, but field must exist)

**"LinkedIn URL not found"**
- Make sure you exported the correct LinkedIn field
- Some CRMs store it as "LinkedIn Profile URL", "LinkedIn", or a custom field
- Check the script is looking for the right column name

**Character encoding issues**
- Save your CSV as **UTF-8** before converting
- This includes special characters, accents, and emoji

**Large imports (1000+ contacts)**
- You may hit Chrome's sync storage limit (~100 KB)
- This supports ~900 typical notes (20 characters each)
- Consider importing in batches or importing only high-priority contacts

---

## Questions?

If you have issues or want help with a different CRM, check the extension's GitHub repo or reach out to support.
