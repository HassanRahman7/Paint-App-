
"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette, Paintbrush, Trash2, Download, Undo2, Redo2, PaintBucket, Minus, RectangleHorizontal, Circle as CircleIcon, Triangle as TriangleIcon, Brush } from 'lucide-react';
import CanvasRenderer, { type CanvasRendererHandle, type DrawingTool } from '@/components/canvas-renderer';

export default function CanvasCraftPage() {
  const [strokeColor, setStrokeColor] = useState<string>('#000000');
  const [fillColor, setFillColor] = useState<string>('#79B4B7'); // Default to primary color
  const [strokeWidth, setStrokeWidth] = useState<number>(5);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('freehand');
  const [isFillEnabled, setIsFillEnabled] = useState<boolean>(true);
  
  const canvasComponentRef = useRef<CanvasRendererHandle>(null);

  const handleClearCanvas = useCallback(() => {
    canvasComponentRef.current?.clearCanvas();
  }, []);

  const handleDownloadDrawing = useCallback(() => {
    canvasComponentRef.current?.downloadDrawing('canvas-craft-drawing.png');
  }, []);

  const handleUndo = useCallback(() => {
    canvasComponentRef.current?.undo();
  }, []);

  const handleRedo = useCallback(() => {
    canvasComponentRef.current?.redo();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'Backspace') {
          event.preventDefault();
          handleClearCanvas();
        } else if (event.key === 's') {
          event.preventDefault();
          handleDownloadDrawing();
        } else if (event.key === 'z') {
          event.preventDefault();
          handleUndo();
        } else if (event.key === 'y') {
          event.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClearCanvas, handleDownloadDrawing, handleUndo, handleRedo]);


  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body">
      <Card className="m-2 sm:m-4 shadow-lg rounded-lg border-border">
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 items-center">
            
            <div className="flex items-center gap-2" title="Drawing Tool">
              <Brush className="h-6 w-6 text-primary" />
              <Select value={selectedTool} onValueChange={(value) => setSelectedTool(value as DrawingTool)}>
                <SelectTrigger className="w-full sm:w-[180px]" aria-label="Select drawing tool">
                  <SelectValue placeholder="Select tool" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="freehand"><div className="flex items-center gap-2"><Brush className="h-4 w-4" /> Freehand</div></SelectItem>
                  <SelectItem value="line"><div className="flex items-center gap-2"><Minus className="h-4 w-4" /> Line</div></SelectItem>
                  <SelectItem value="rectangle"><div className="flex items-center gap-2"><RectangleHorizontal className="h-4 w-4" /> Rectangle</div></SelectItem>
                  <SelectItem value="circle"><div className="flex items-center gap-2"><CircleIcon className="h-4 w-4" /> Circle</div></SelectItem>
                  <SelectItem value="triangle"><div className="flex items-center gap-2"><TriangleIcon className="h-4 w-4" /> Triangle</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2" title="Stroke Color">
              <Palette className="h-6 w-6 text-primary" />
              <label htmlFor="strokeColorPicker" className="sr-only">Stroke Color</label>
              <input
                type="color"
                id="strokeColorPicker"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
                className="w-10 h-10 p-0 bg-transparent border border-input rounded-md cursor-pointer appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                aria-label="Select stroke color"
              />
            </div>

            <div className="flex items-center gap-2" title="Fill Color">
              <PaintBucket className="h-6 w-6 text-primary" />
              <label htmlFor="fillColorPicker" className="sr-only">Fill Color</label>
              <input
                type="color"
                id="fillColorPicker"
                value={fillColor}
                onChange={(e) => setFillColor(e.target.value)}
                className="w-10 h-10 p-0 bg-transparent border border-input rounded-md cursor-pointer appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                aria-label="Select fill color"
                disabled={selectedTool === 'freehand' || selectedTool === 'line'}
              />
            </div>
            
            <div className="flex items-center gap-2" title={`Stroke Width: ${strokeWidth}px`}>
              <Paintbrush className="h-6 w-6 text-primary" />
              <Slider
                min={1}
                max={50}
                step={1}
                value={[strokeWidth]}
                onValueChange={(value) => setStrokeWidth(value[0])}
                className="w-full min-w-[100px] sm:min-w-[150px]"
                aria-label={`Stroke width slider: ${strokeWidth} pixels`}
              />
              <span className="text-sm w-8 text-center select-none">{strokeWidth}</span>
            </div>

            <div className="flex items-center gap-2" title="Fill Shape">
              <Checkbox
                id="fillShape"
                checked={isFillEnabled}
                onCheckedChange={(checked) => setIsFillEnabled(checked as boolean)}
                disabled={selectedTool === 'freehand' || selectedTool === 'line'}
                aria-label="Toggle fill for shapes"
              />
              <Label htmlFor="fillShape" className={selectedTool === 'freehand' || selectedTool === 'line' ? 'text-muted-foreground' : ''}>Fill Shape</Label>
            </div>


            <div className="flex items-center gap-2 sm:gap-3 md:col-start-2 lg:col-start-3 xl:col-start-auto">
              <Button variant="outline" onClick={handleUndo} aria-label="Undo last action" title="Undo (Ctrl+Z)">
                <Undo2 className="h-5 w-5 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Undo</span>
              </Button>
              <Button variant="outline" onClick={handleRedo} aria-label="Redo last action" title="Redo (Ctrl+Y)">
                <Redo2 className="h-5 w-5 mr-0 sm:mr-2" />
                <span className="hidden sm:inline">Redo</span>
              </Button>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
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
            tool={selectedTool}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            fillColor={fillColor}
            isFillEnabled={isFillEnabled}
          />
        </div>
      </main>
    </div>
  );
}

    