<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('asteroids', function (Blueprint $table) {
            $table->id();
            $table->string('nasa_id')->unique();
            $table->string('name')->index();
            $table->float('diameter'); // metros
            $table->float('velocity'); // km/s
            $table->date('close_approach_date')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('asteroids');
    }
};
