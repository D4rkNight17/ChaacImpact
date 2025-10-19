<?php

namespace App\Http\Controllers;

use App\Models\Asteroid;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class AsteroidController extends Controller
{
    // ==============================================================
    // 📡 GET /api/asteroids → devuelve todos los asteroides guardados
    // ==============================================================
    public function index()
    {
        $asteroids = Asteroid::orderBy('name')->get();
        return response()->json($asteroids, 200);
    }

    // ==============================================================
    // 🔎 GET /api/asteroids/{name} → busca por nombre
    // ==============================================================

    public function show(string $name)
    {
        // 1️⃣ Buscar en base de datos local (coincidencia parcial)
        $local = Asteroid::where('name', 'like', '%' . $name . '%')->first();

        if ($local) {
            return response()->json([
                'source' => 'database',
                'data' => $local
            ], 200);
        }

        // 2️⃣ Si no existe, buscar en la API de la NASA
        $apiKey = env('NASA_API_KEY', 'DEMO_KEY');
        $apiUrl = env('NASA_API_URL', 'https://api.nasa.gov/neo/rest/v1/neo/browse');

        $page = 0;
        $maxPages = 3; // 🔹 límite para no saturar la API

        do {
            $response = Http::timeout(20)->get($apiUrl, [
                'api_key' => $apiKey,
                'page' => $page,
            ]);

            if ($response->failed()) {
                return response()->json(['error' => 'Error al conectar con la API de la NASA'], 502);
            }

            $data = $response->json();
            $objects = $data['near_earth_objects'] ?? [];

            $found = collect($objects)->first(function ($o) use ($name) {
                return stripos($o['name'] ?? '', $name) !== false;
            });

            // 3️⃣ Si se encontró, guardar o recuperar
            if ($found) {
                $diameter = data_get($found, 'estimated_diameter.meters.estimated_diameter_max', 0);
                $first = data_get($found, 'close_approach_data.0', []);
                $velocity = (float) data_get($first, 'relative_velocity.kilometers_per_second', 0);
                $date = data_get($first, 'close_approach_date');

                // ✅ Evita duplicados con firstOrCreate
                $asteroid = Asteroid::firstOrCreate(
                    ['nasa_id' => $found['id'] ?? ''],
                    [
                        'name' => $found['name'] ?? $name,
                        'diameter' => (float) $diameter,
                        'velocity' => (float) $velocity,
                        'close_approach_date' => $date,
                    ]
                );

                return response()->json([
                    'source' => 'nasa_api',
                    'data' => $asteroid
                ], 201);
            }

            $page++;
        } while ($page < ($data['page']['total_pages'] ?? 1) && $page < $maxPages);

        // 4️⃣ Si no se encontró en ningún lugar
        return response()->json(['error' => 'Asteroide no encontrado'], 404);
    }
}
