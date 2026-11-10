# Premium Teacher Centre and Career Guidance setup

## Included in this update
- Teacher Centre catalogue for Grade 8 and Grade 9.
- Per-resource M-Pesa product IDs and prices.
- Protected download function backed by the private Supabase Storage bucket `teacher-premium`.
- Career Guidance product `career_guidance_full_package` at KES 30.
- 30-day access for new Teacher Centre and Career Guidance purchases.
- Existing learner product prices and the production Buy Goods STK settings are retained.

## Resource prices
- Schemes of Work: KES 70 each.
- Term Lesson Plans: KES 100 each.
- Full-Year Lesson Plans: KES 200 each.
- Learner/Teaching Notes: KES 50 each.
- CATs: KES 20 each.
- End-Term Examinations: KES 30 each.
- Records of Work are temporarily set to KES 50 pending the owner's confirmation.

## One-time private resource migration
Before deploying, extract this ZIP and double-click `START-PREMIUM-PDF-UPLOAD.bat` on a trusted Windows computer. The helper checks for Node.js, asks for the Supabase Project URL, and securely prompts for the service_role key with hidden input. The key is used only in that local process and is not written to a project file. Never commit either secret or send it in chat.

The migration validates that every catalogued PDF exists and that its storage path matches the catalogue. It creates the private `teacher-premium` bucket if needed (and changes it to private if it is currently public), uploads every Grade 8 and Grade 9 PDF, then downloads each object to verify its byte size. Only after every upload and verification succeeds are the local PDFs moved out of the deployable project into a timestamped sibling backup folder. They are backed up, not permanently deleted. If an upload or verification fails, the script stops and leaves the local PDFs in place.

Do not deploy until the helper reports `PRIVATE PDF MIGRATION COMPLETED SUCCESSFULLY.`

## Deployment checks
1. Confirm Netlify production environment still has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, M-Pesa production credentials, and callback URL.
2. Confirm `MPESA_SHORTCODE`, `MPESA_TILL_NUMBER`, and `CustomerBuyGoodsOnline` settings remain as already configured in the production function.
3. Deploy a preview first.
4. Use existing successful payment/entitlement rows for access checks. Do not make another live payment.
5. Check that direct PDF URLs return 401 without a signed-in learner session, and return the PDF only for the account with a matching active entitlement.
6. Check Career Guidance access through `/.netlify/functions/grade10-access`.

## Important
- This ZIP is a prepared source update, not a deployed production change.
- Do not merge older payment PRs (#1 or #14) over this source without a separate review.


## Catalogue note
The current Grade 9 catalogue contains 72 purchasable resources, while the folder contains 140 PDFs. The additional 68 PDFs are uploaded into private storage as unlisted files, but are not displayed or purchasable in the Teacher Centre until they are added to the catalogue with their own product IDs and prices.

## Windows helper
Double-click `START-PREMIUM-PDF-UPLOAD.bat` from the extracted project folder. If Windows blocks the file, use the right-click menu and choose **Run** or **Open**. The helper does not deploy the site; it only performs the one-time private storage migration.
