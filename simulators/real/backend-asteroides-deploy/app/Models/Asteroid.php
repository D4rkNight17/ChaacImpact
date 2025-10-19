<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Asteroid extends Model
{
    use HasFactory;

    // Campos que se pueden llenar desde el código o peticiones
    protected $fillable = [
        'nasa_id',
        'name',
        'diameter',
        'velocity',
        'close_approach_date',
    ];

    // Tipos de datos automáticos al leer desde la base
    protected $casts = [
        'diameter' => 'float',
        'velocity' => 'float',
        'close_approach_date' => 'date',
    ];
}
