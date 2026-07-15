-- Các bước này thuộc luồng Ứng cũ và không còn tồn tại trong quy trình hiện tại.
DELETE FROM "MaterialWorkflowRole"
WHERE "step" IN ('ungAdvance', 'ungEntry', 'ungConfirm', 'ungBbkt');
