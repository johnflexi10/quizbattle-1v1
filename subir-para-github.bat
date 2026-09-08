@echo off
chcp 65001 > nul
echo ====================================================
echo  ENVIANDO QUIZBATTLE PARA O GITHUB...
echo ====================================================
echo.
cd /d "%~dp0"

echo Enviando arquivos para https://github.com/johnflexi10/quizbattle-1v1.git ...
echo.
git push -u origin main > git_push_result.txt 2>&1
type git_push_result.txt

echo.
if %errorlevel% equ 0 (
    echo ====================================================
    echo  SUCESSO! O codigo ja esta no seu GitHub!
    echo  Acesse: https://github.com/johnflexi10/quizbattle-1v1
    echo ====================================================
) else (
    echo ====================================================
    echo  ATENCAO: Veja a mensagem de erro acima.
    echo  Se pediu senha: o GitHub exige um TOKEN (ghp_...)
    echo ====================================================
)
echo.
pause
