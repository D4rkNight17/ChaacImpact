<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AsteroidController;

Route::get('/asteroids', [AsteroidController::class, 'index']);
Route::get('/asteroids/{name}', [AsteroidController::class, 'show']);
