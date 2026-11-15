# Junior School Learning Hub — Combined Quiz Bank
Academic year: 2027

This manifest describes the combined Grade 7–9 working quiz bank:
- Grade 7: 4,050 records
- Grade 8: 2,640 records
- Grade 9: 3,600 records
- Total: 10,290 records across nine learning areas per grade.

Schema compatibility:
- Grade 7 records use prompt/correct_option.
- Grade 8 and 9 records use question/correct_index.
- Load js/quiz-schema-adapter.js before passing mixed-grade records to a shared quiz interface.

Release caution: this is a working draft. Subject teachers should verify accuracy, answer keys, explanations, curriculum coverage and repeated items before learner release. This repository change does not replace the existing quiz engine, learner login, M-Pesa payment flow, saved attempts, or Arena League.
