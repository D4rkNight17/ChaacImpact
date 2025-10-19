<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use App\Models\Asteroid;

class SyncAsteroidsCommand extends Command
{
    protected $signature = 'asteroids:sync';
    protected $description = 'Sincroniza todos los asteroides desde la API NeoWs de la NASA hacia la base de datos local';

    public function handle()
    {
        $apiKey = env('NASA_API_KEY', '5ppWZbgGda6BCzsFlpjlseLvbN2qcIk5phZOt1Pw');
        $apiUrl = env('NASA_API_URL', 'https://api.nasa.gov/neo/rest/v1/neo/browse');

        $page = 0;
        $totalPages = null;
        $totalAsteroids = 0;

        $this->info('🚀 Iniciando sincronización completa con la API NeoWs...');
        $this->newLine();

        do {
            $this->line("⏳ Descargando página {$page}...");

            $response = Http::timeout(30)->get($apiUrl, [
                'api_key' => $apiKey,
                'page' => $page,
            ]);

            if ($response->failed()) {
                $this->error("❌ Error al conectar con la NASA en página {$page}");
                break;
            }

            $data = $response->json();
            $objects = $data['near_earth_objects'] ?? [];
            $totalPages = $data['page']['total_pages'] ?? 0;

            foreach ($objects as $o) {
                $nasaId = $o['id'] ?? null;
                $name = $o['name'] ?? 'Desconocido';
                $diameter = data_get($o, 'estimated_diameter.meters.estimated_diameter_max', 0);
                $firstApproach = data_get($o, 'close_approach_data.0', []);
                $velocity = (float) data_get($firstApproach, 'relative_velocity.kilometers_per_second', 0);
                $date = data_get($firstApproach, 'close_approach_date');

                Asteroid::updateOrCreate(
                    ['nasa_id' => $nasaId],
                    [
                        'name' => $name,
                        'diameter' => (float) $diameter,
                        'velocity' => (float) $velocity,
                        'close_approach_date' => $date,
                    ]
                );

                $totalAsteroids++;
            }

            $this->line("✅ Página {$page} sincronizada ({$totalAsteroids} objetos totales)");
            $page++;

        } while ($page < $totalPages);

        $this->newLine();
        $this->info("🎯 Sincronización completa. Total: {$totalAsteroids} asteroides procesados.");
        return Command::SUCCESS;
    }
}
