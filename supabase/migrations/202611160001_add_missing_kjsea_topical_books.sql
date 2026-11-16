-- Add the four original JSLH topical books to the KJSEA 2027 catalogue.
-- Keep them unpublished until their PDFs are uploaded and verified in private storage.
insert into public.learner_revision_resources
(id,title,subject,grade,resource_type,description,storage_path,price_kes,published)
values
('kjsea2027_mathematics_topical','Mathematics Topical Revision','Mathematics','Grades 7-9','topical_revision','Original JSLH topical practice questions arranged for Grades 7, 8 and 9.','2027/mathematics-topical.pdf',10,false),
('kjsea2027_english_topical','English Topical Revision','English','Grades 7-9','topical_revision','Original JSLH topical practice questions arranged for Grades 7, 8 and 9.','2027/english-topical.pdf',10,false),
('kjsea2027_cre_topical','CRE Topical Revision','CRE','Grades 7-9','topical_revision','Original JSLH topical practice questions arranged for Grades 7, 8 and 9.','2027/cre-topical.pdf',10,false),
('kjsea2027_creative_arts_sports_topical','Creative Arts & Sports Topical Revision','Creative Arts & Sports','Grades 7-9','topical_revision','Original JSLH topical practice questions arranged for Grades 7, 8 and 9.','2027/creative-arts-sports-topical.pdf',10,false)
on conflict (id) do update set
 title=excluded.title,subject=excluded.subject,grade=excluded.grade,
 resource_type=excluded.resource_type,description=excluded.description,
 storage_path=excluded.storage_path,price_kes=10,published=false;
