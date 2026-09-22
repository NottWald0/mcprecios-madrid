@echo off
cd C:\Users\danib\ComparadorDePrecios
C:\Users\danib\AppData\Local\Programs\Python\Python313\python.exe scraper.py
C:\Users\danib\AppData\Local\Programs\Python\Python313\python.exe db_loader.py
echo Scraping completado: %date% %time% >> log.txt
