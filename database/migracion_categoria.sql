-- Añade la categoría de cada producto (la sección de la carta de Uber Eats: "McMenú®",
-- "Complementos", "Bebidas Frías"...). La rellena db_loader.py a partir de los datos del scraper.
-- Ejecutar una sola vez sobre una base de datos que aún no tenga la columna.
ALTER TABLE productos ADD COLUMN categoria VARCHAR(100) NULL;
