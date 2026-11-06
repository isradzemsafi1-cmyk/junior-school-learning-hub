## Manual content workflow (do not commit lesson payloads)

The three term manifests are source-derived topic/sequence metadata, not notes or completed premium lessons. Use the private content schema in `grade9-mathematics-library-plan.md` to author reviewed lesson JSON outside the repository. The learner page receives these JSON objects only from the entitlement-checked function.

Current topic coverage gaps remain: Term I cube roots from tables; Term II regular pentagon/hexagon area, sphere/hemisphere surface area, foreign-currency exchange, export/import duties and VAT, and weight; Term III the grouped-data median formula. Do not fill these with guessed material. The source PDF text extraction also has OCR damage; check original pages for lesson details and numerical examples.

The repository cannot provision Supabase Storage or run an authenticated production-backed browser test. See `grade9-mathematics-private-storage-upload.md` for the administrator-run SQL, private bucket checks, file paths and preview verification procedure.
