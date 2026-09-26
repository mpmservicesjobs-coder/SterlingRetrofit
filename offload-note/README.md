# Offload Waste Removal: on-site waste transfer notes

A phone web app for Offload operatives. The operative fills in the waste transfer note at the job, the customer and operative both sign on the screen, and the signed PDF goes to the customer by email with a BCC copy to info@offloadwaste.com. Every note is stored and never deleted automatically.

It runs at `/note` (for example `offloadwaste.com/note`), sits behind a login and is set to `noindex`.

> This folder is separate from the Sterling Retrofit site in the rest of this repo. The two share nothing. The Offload app is a standalone Next.js project that deploys on its own.

## Before launch: the owner must confirm

1. **Waste carrier registration (CBDU) number.** Set to CBDU662023 in `src/config/offload.ts` (`CARRIER_REG_NO`). If it is ever emptied, the app refuses to send or save any note.
2. **SIC code 38110.** Check it is right for Offload (`OFFLOAD_SIC`).
3. **Vans.** Add the registrations in the admin screen under Vehicles, or to `VEHICLES` in the config.
4. **Destination sites.** Add each tip or transfer station under Destination sites, with its permit number and the date you checked it on the Environment Agency public register.
5. **EWC list.** Check the codes in `src/lib/ewc.ts` against the current Environment Agency WM3 guidance, Appendix A. The 7 common codes in the brief are correct as listed and none of them is hazardous.
6. **Refuse list.** `REFUSED_ITEMS` in the config holds the four items named in the brief. Add anything else from the operating policy. That document was not in this repo.
7. **Logo.** The app and PDF use the JPG you supplied (`assets/offload-logo.jpg`). Send the master vector (SVG or PDF) and it will replace the JPG. The logo has not been redrawn.
8. **Conflict with the website brief.** The website brief still says "Offload Waste Ltd", a 0113 number and "WASTE REMOVAL LEEDS". This app uses the confirmed facts: sole trader, 07777 365390, and "WASTE REMOVAL". The website should be updated to match.

## What it does (brief section by section)

| Brief | Where |
|---|---|
| Business facts in one file | `src/config/offload.ts` |
| Login with name + 4 to 6 digit PIN, 30 days on the phone, lockout after 5 wrong PINs | `src/lib/auth.ts` |
| Operative and admin roles. Operatives see only their own notes | `assertOwner` in `src/lib/notes.ts` |
| Rate limits (logins per IP, 30 sends per operative per hour) and a log of every send | `src/lib/rate.ts`, `audit_log` table |
| 8-step form, one step per screen, progress bar, sticky Back and Next | `src/components/NoteWizard.tsx` |
| Note numbers `OFF-YYMMDD-NN`, UK date, sequential per day | `nextNoteNo` in `src/lib/notes.ts` |
| Vague descriptions blocked ("general waste", "rubbish", "builders waste" and similar) | `vagueDescriptionError` in `src/lib/note.ts` |
| POPs prompt for sofas and armchairs: 20 03 07, fixed description, fixed chemicals text, keep-separate warning. Mattresses, beds, curtains and blinds never trigger it | `detectPops` in `src/lib/note.ts` |
| Hazardous stop, from the Yes answer or any asterisk code. The code is never saved and the refuse list is shown | `NoteWizard.tsx`, `src/lib/ewc.ts` |
| Waste hierarchy tick, on its own line on screen and on the PDF | Step 4, PDF section 4 |
| Destination can be skipped at the job and added from admin. The signed PDF never changes: a separate destination record PDF is created instead | `setDestination` |
| Photos, compressed on the phone, stored, not emailed | Step 7, `/api/notes/photo` |
| Signatures saved as PNG with timestamp and user agent | `submitNote`, audit trail |
| PDF made once on the server, stored, and that exact file is emailed. Its SHA-256 is checked before every send | `src/lib/pdf.tsx`, `emailNote` |
| Hash of the signed data printed in the PDF footer. Admin shows whether the stored data still matches | `verifyHash` |
| Email failures keep the note and put it in the "not delivered" queue with Retry | Admin notes list |
| "Save without sending" when the customer has no email | Step 2 tick box, step 8 |
| Autosave to the phone. Offline queue that retries, labelled NOT SENT YET until the server confirms | `src/components/client.ts`, `public/sw.js` |
| Admin: search, filters, PDF, photos, audit trail, resend, destination, CSV export, operatives, vehicles, sites | `src/app/admin` |
| Corrections: a new signed note that references the old one. The old note is marked superseded | "Start a correction" in admin |
| 2-year retention: notes older than 2 years are marked "eligible for deletion" and nothing is deleted | `eligibleForDeletion` |
| Light and dark theme following the phone, 16px or larger inputs, 375px and 360px tested | `src/app/globals.css` |

### Decisions the brief left open

- **Destination added after signing.** The brief says the PDF is never regenerated, and also that the destination can be added later. Both hold: the signed note stays exactly as signed and reads "to be confirmed". Adding the destination creates a one-page "Destination record" PDF that quotes the original note's hash. Resends attach both PDFs.
- **The operative's name** appears only as the signatory on the PDF. The destination record carries no name. The admin login name appears in the office screens only, so use a role name such as "Office".
- **Missing registration number** blocks both Send and Save. A note without it would be missing a legally required item.
- **Hazardous stop** offers "I tapped Yes by mistake" or "Pick a different code" alongside "Cancel the note", so a mis-tap does not throw away the whole note. Nothing hazardous is ever saved.

## Running it locally

```bash
cd offload-note
npm install
npm run dev        # http://localhost:3000/note, login Admin / 123456 (development only)
npm test           # rules: vague descriptions, POPs, hazardous codes, postcodes, validation
```

Without environment variables, development uses an embedded Postgres in `.data/pglite`, stores files in `.data/files`, and writes emails to `.data/outbox` instead of sending them. `tests/e2e.mjs` is a full browser run covering login, a complete note, the POPs and hazardous stops, the offline queue, admin follow-up and dark mode at 360px.

## Deploying (Vercel)

1. Create a Vercel project from this repo with **Root Directory** set to `offload-note`.
2. Create a Postgres database in a UK or EU region (Neon `aws-eu-west-2`, or Supabase London) and set `DATABASE_URL`. Tables are created on first run.
3. Create a **private** bucket (Supabase Storage, Cloudflare R2 with the EU jurisdiction, or AWS S3 in eu-west-2) and set the `S3_*` variables. Files are only ever served through 5-minute signed URLs, after a login check.
4. Set `ADMIN_NAME` and `ADMIN_PIN` for the first admin login. Once someone has logged in, change the PIN from the admin screen.
5. Set `RESEND_API_KEY` (see DNS below).
6. Mount it at `offloadwaste.com/note`. If the main site is on Vercel, add a rewrite there:
   `{ "source": "/note/:path*", "destination": "https://<this-project>.vercel.app/note/:path*" }`.
   On any other host, proxy `/note` to this project the same way.
7. On the main site: add `Disallow: /note` to `robots.txt` and keep `/note` out of the sitemap. The app already sends `X-Robots-Tag: noindex` and a robots `noindex` meta tag.

See `.env.example` for every variable.

## Email DNS records for offloadwaste.com

Add the domain in Resend (Domains, Add domain, `offloadwaste.com`, region EU). Resend then shows the exact values. They follow this pattern:

| Type | Name (host) | Value | Why |
|---|---|---|---|
| TXT | `resend._domainkey` | the `p=MIGf...` key Resend shows | DKIM: proves the mail is really from you |
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com`, priority 10 | Bounce handling for the sending subdomain |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF for the sending subdomain |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:info@offloadwaste.com` | DMARC. Move to `p=quarantine` after a few weeks of clean reports |

Copy the values from the Resend dashboard, not from this table. If `offloadwaste.com` already has a DMARC record, keep one record only. Do not change the existing MX records for info@offloadwaste.com. Resend's records go on the `send` subdomain and leave your inbox alone.

## Legal basis

The form and PDF follow the Waste Duty of Care Code of Practice (November 2018) and the gov.uk waste transfer notes guidance: written description with EWC code, quantity, loose or container and container type, time and place of transfer, the transferor's SIC code, names, addresses, capacities and registration of both parties, signatures from both, the regulation 12 waste hierarchy statement, and 2-year retention. This is guidance, not legal advice.
