'use client';

import React, { useState } from 'react';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { supabase } from '@/lib/supabase';

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' });

const tourPackageSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    tour_title: { type: Type.STRING },
    destination: { type: Type.STRING },
    is_free: { type: Type.BOOLEAN },
    estimated_total_duration_minutes: { type: Type.INTEGER },
    stops: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stop_number: { type: Type.INTEGER },
          stop_name: { type: Type.STRING },
          latitude: { type: Type.NUMBER },
          longitude: { type: Type.NUMBER },
          approx_duration_minutes: { type: Type.INTEGER },
          navigation_instructions_from_previous: { type: Type.STRING },
          text_content: { type: Type.STRING },
          audio_script: { type: Type.STRING }
        },
        required: [
          'stop_number',
          'stop_name',
          'latitude',
          'longitude',
          'approx_duration_minutes',
          'navigation_instructions_from_previous',
          'text_content',
          'audio_script'
        ]
      }
    }
  },
  required: ['tour_title', 'destination', 'is_free', 'stops']
};

export default function AITourGeneratorPage() {
  const [islandName, setIslandName] = useState('');
  const [stopCount, setStopCount] = useState('5');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedTour, setGeneratedTour] = useState<any>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!islandName.trim()) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Create a ${stopCount}-stop digital walking/driving tour package for the location: "${islandName}".`,
        config: {
          systemInstruction: `You are an expert travel writer and digital tour guide creator. Output complete tour packages strictly adhering to the JSON schema.
Rules:
1. Provide precise real-world GPS coordinates (latitude/longitude) for every stop.
2. The "navigation_instructions_from_previous" field must contain step-by-step physical directions from the prior stop.
3. The "audio_script" field must be written in an engaging, natural voice suitable for narration.
4. Stop 1 is always the official starting point.`,
          responseMimeType: 'application/json',
          responseSchema: tourPackageSchema,
        }
      });

      if (response.text) {
        setGeneratedTour(JSON.parse(response.text));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate tour package.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToSupabase = async () => {
    if (!generatedTour) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      // 1. Get or create Destination
      let { data: destinationData } = await supabase
        .from('destinations')
        .select('id')
        .eq('name', generatedTour.destination)
        .single();

      if (!destinationData) {
        const { data: newDest, error: destError } = await supabase
          .from('destinations')
          .insert({ name: generatedTour.destination, type: 'Island' })
          .select()
          .single();
        if (destError) throw destError;
        destinationData = newDest;
      }

      // 2. Insert Tour
      const { data: tourData, error: tourError } = await supabase
        .from('tours')
        .insert({
          destination_id: destinationData.id,
          title: generatedTour.tour_title,
          description: `AI-generated tour featuring ${generatedTour.stops.length} stops in ${generatedTour.destination}.`,
          is_free: generatedTour.is_free || false,
          price: 0.00
        })
        .select()
        .single();

      if (tourError) throw tourError;

      // 3. Insert Tour Stops
      const stopsToInsert = generatedTour.stops.map((stop: any) => ({
        tour_id: tourData.id,
        stop_number: stop.stop_number,
        stop_name: stop.stop_name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        approx_duration_minutes: stop.approx_duration_minutes || 15,
        navigation_instructions: stop.navigation_instructions_from_previous,
        text_content: stop.text_content,
        audio_script: stop.audio_script
      }));

      const { error: stopsError } = await supabase
        .from('tour_stops')
        .insert(stopsToInsert);

      if (stopsError) throw stopsError;

      setSuccessMsg(`Successfully saved "${generatedTour.tour_title}" and ${generatedTour.stops.length} stops to Supabase!`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save tour to Supabase.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header className="border-b border-slate-800 pb-4">
          <h1 className="text-3xl font-bold text-emerald-400">AI Tour Generator</h1>
          <p className="text-slate-400 text-sm mt-1">
            Generate full structured tour packages instantly using Gemini models from Google AI Studio.
          </p>
        </header>

        <form onSubmit={handleGenerate} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Island / Location Name
              </label>
              <input
                type="text"
                placeholder="e.g., Bonaire, Mallorca, Aruba..."
                value={islandName}
                onChange={(e) => setIslandName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Number of Stops
              </label>
              <select
                value={stopCount}
                onChange={(e) => setStopCount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors"
              >
                <option value="3">3 Stops</option>
                <option value="5">5 Stops</option>
                <option value="8">8 Stops</option>
                <option value="10">10 Stops</option>
              </select>
            </div>

          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 text-slate-950 font-bold py-3.5 px-6 rounded-lg transition-all shadow-lg flex items-center justify-center space-x-2"
          >
            {loading ? <span>Generating Tour Package...</span> : <span>Generate Tour with Gemini</span>}
          </button>
        </form>

        {error && <div className="bg-red-950/50 border border-red-800 text-red-300 p-4 rounded-xl text-sm">{error}</div>}
        {successMsg && <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 p-4 rounded-xl text-sm">{successMsg}</div>}

        {generatedTour && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {generatedTour.destination}
                </span>
                <h2 className="text-2xl font-bold mt-2">{generatedTour.tour_title}</h2>
              </div>
              <button
                onClick={handleSaveToSupabase}
                disabled={saving}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:bg-slate-800"
              >
                {saving ? 'Saving...' : 'Save Tour to Supabase'}
              </button>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-300">Generated Stops ({generatedTour.stops.length})</h3>
              {generatedTour.stops.map((stop: any, index: number) => (
                <div key={index} className="bg-slate-950 border border-slate-800/80 rounded-lg p-5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-emerald-400">Stop {stop.stop_number}</span>
                    <span className="text-xs text-slate-400">GPS: {stop.latitude}, {stop.longitude}</span>
                  </div>
                  <input
                    type="text"
                    defaultValue={stop.stop_name}
                    onChange={(e) => (stop.stop_name = e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-100 font-semibold"
                  />
                  <textarea
                    defaultValue={stop.navigation_instructions_from_previous}
                    onChange={(e) => (stop.navigation_instructions_from_previous = e.target.value)}
                    rows={2}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-300"
                    placeholder="Directions..."
                  />
                  <textarea
                    defaultValue={stop.text_content}
                    onChange={(e) => (stop.text_content = e.target.value)}
                    rows={3}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-300"
                    placeholder="Tour Narrative..."
                  />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
