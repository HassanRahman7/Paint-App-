
"use client";

import type { LegacyRef } from 'react';
import React, { useRef, useState, useEffect } from 'react';
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Palette, Paintbrush, Trash2, Download } from 'lucide-react';
import CanvasRenderer, { type CanvasRendererHandle } from '@/components/canvas-renderer';

export default function CanvasCraftPage() {
  const [brushColor, setBrushColor] = useState<string>('#000000');
  const [brushSize, setBrushSize] = useState<number>(5);
  const canvasComponentRef = useRef<CanvasRendererHandle>(null);

  const handleClearCanvas = () => {
    canvasComponentRef.current?.clearCanvas();
  };

  const handleDownloadDrawing = () => {
    canvasComponentRef.current?.downloadDrawing('canvas-craft-drawing.png');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'Backspace') {
          event.preventDefault();
          handleClearCanvas();
        } else if (event.key === 's') {
          event.preventDefault();
          handleDownloadDrawing();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []); // Empty dependency array ensures this runs once on mount and cleans up on unmount


  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body">
      <Card className="m-2 sm:m-4 shadow-lg rounded-lg border-border">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            
            <div className="flex items-center gap-2" title="Brush Color">
              <Palette className="h-6 w-6 text-primary" />
              <label htmlFor="colorPicker" className="sr-only">Brush Color</label>
              <input
                type="color"
                id="colorPicker"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="w-10 h-10 p-0 bg-transparent border border-input rounded-md cursor-pointer appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                aria-label="Select brush color"
              />
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[150px] sm:min-w-[200px] max-w-[300px]" title={`Brush Size: ${brushSize}px`}>
              <Paintbrush className="h-6 w-6 text-primary" />
              <Slider
                min={1}
                max={50}
                step={1}
                value={[brushSize]}
                onValueChange={(value) => setBrushSize(value[0])}
                className="w-full"
                aria-label={`Brush size slider: ${brushSize} pixels`}
              />
              <span className="text-sm w-8 text-center select-none">{brushSize}</span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 ml-auto">
              <Button variant="outline" onClick={handleClearCanvas} aria-label="Clear canvas" title="Clear Canvas (Ctrl+Backspace)">
                <Trash2 className="h-5 w-5 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
              <Button onClick={handleDownloadDrawing} aria-label="Download drawing" title="Download Drawing (Ctrl+S)">
                <Download className="h-5 w-5 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <main className="flex-1 mx-2 mb-2 sm:mx-4 sm:mb-4 mt-0 p-0 overflow-hidden">
        <div className="w-full h-full bg-white rounded-lg shadow-inner overflow-hidden border border-border">
           <CanvasRenderer
            ref={canvasComponentRef}
            brushColor={brushColor}
            brushSize={brushSize}
          />
        </div>
      </main>
    </div>
  );
}
