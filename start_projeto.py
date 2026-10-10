import subprocess
import time
import re
import threading
import sys
from pathlib import Path

# Caminhos base baseados na estrutura do projeto
BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
ENV_PATH = FRONTEND_DIR / ".env"

# Lista para controlar os processos abertos e fechá-los ao sair
processes = []

def cleanup():
    print("\n[INFO] Encerrando todos os servidores e túneis...")
    for p in processes:
        try:
            p.terminate()
            p.wait(timeout=3)
        except Exception:
            p.kill()

def get_cloudflare_url(cmd, description):
    print(f"[INFO] Iniciando {description}...")
    # shell=True é necessário no Windows para encontrar comandos como npx/npm
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        shell=True,
        encoding='utf-8',
        errors='ignore'
    )
    processes.append(process)

    url = None
    url_pattern = re.compile(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com')

    def monitor_output():
        nonlocal url
        for line in process.stdout:
            match = url_pattern.search(line)
            if match and not url:
                url = match.group(0)

    # Thread para ler a saída do comando em segundo plano sem travar o script
    thread = threading.Thread(target=monitor_output, daemon=True)
    thread.start()

    # Aguarda até que a URL do Cloudflare seja gerada
    start_time = time.time()
    while not url:
        if process.poll() is not None:
            raise Exception(f"O processo de {description} encerrou inesperadamente.")
        if time.time() - start_time > 45:
            raise Exception(f"Timeout: O Cloudflare Tunnel ({description}) demorou muito para responder.")
        time.sleep(0.5)

    print(f"[SUCESSO] {description} gerado com sucesso!")
    return url

def update_frontend_env(backend_url):
    FRONTEND_DIR.mkdir(parents=True, exist_ok=True)
    lines = []
    
    if ENV_PATH.exists():
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()

    updated = False
    new_lines = []
    for line in lines:
        if line.strip().startswith("VITE_API_URL="):
            new_lines.append(f"VITE_API_URL={backend_url}\n")
            updated = True
        else:
            new_lines.append(line)

    if not updated:
        new_lines.append(f"VITE_API_URL={backend_url}\n")

    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    
    print(f"[INFO] Arquivo .env atualizado em: {ENV_PATH}")

def main():
    try:
        # 1. Iniciar o Backend (npm run dev)
        print("[INFO] Iniciando o servidor Backend...")
        backend_server = subprocess.Popen(
            "npm run dev",
            cwd=BACKEND_DIR,
            shell=True,
            stdout=subprocess.DEVNULL, # Oculta os logs do servidor para manter o terminal limpo
            stderr=subprocess.DEVNULL
        )
        processes.append(backend_server)
        time.sleep(3) # Pequena pausa para garantir que o backend subiu na porta 3000

        # 2. Abrir rota segura para o Backend e capturar a URL HTTPS
        backend_url = get_cloudflare_url("npx cloudflared tunnel --url http://localhost:3000", "Cloudflare Backend")

        # 3. Inserir o LINK HTTPS gerado no .env do Frontend
        update_frontend_env(backend_url)

        # 4. Iniciar o Frontend (npm run dev)
        print("[INFO] Iniciando o servidor Frontend...")
        frontend_server = subprocess.Popen(
            "npm run dev",
            cwd=FRONTEND_DIR,
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        processes.append(frontend_server)
        time.sleep(3) # Pequena pausa para o Vite subir na porta 5173

        # 5. Abrir rota segura para o Frontend e capturar a URL HTTPS final
        frontend_url = get_cloudflare_url("npx cloudflared tunnel --url http://localhost:5173", "Cloudflare Frontend")

        # 6. Exibir o resultado final
        print("\n" + "="*70)
        print("🚀 TUDO PRONTO E RODANDO COM SUCESSO!")
        print(f"🔗 URL Final para acessar o Frontend (HTTPS): {frontend_url}")
        print("="*70)
        print("Pressione [CTRL + C] neste terminal a qualquer momento para encerrar tudo.\n")

        # Mantém o script rodando em loop para segurar os processos ativos
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[INFO] Execução interrompida pelo usuário.")
    except Exception as e:
        print(f"\n[ERRO] Ocorreu um erro durante a execução: {e}")
    finally:
        cleanup()

if __name__ == "__main__":
    main()