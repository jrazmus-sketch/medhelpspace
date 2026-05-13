SELECT
  (SELECT COUNT(*) FROM pages) AS pages,
  (SELECT COUNT(*) FROM lessons) AS lessons,
  (SELECT COUNT(*) FROM quiz_questions) AS quiz_questions,
  (SELECT COUNT(*) FROM flashcard_items) AS flashcard_items,
  (SELECT COUNT(*) FROM presentation_slides) AS presentation_slides,
  (SELECT COUNT(*) FROM nav_items) AS nav_items;
