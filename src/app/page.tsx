
"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette, Paintbrush, Trash2, Download, Undo2, Redo2, PaintBucket, Minus, RectangleHorizontal, Circle as CircleIcon, Triangle as TriangleIcon, Brush, Type, AlignLeft, AlignCenter, AlignRight, Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, Eraser, ImagePlus } from 'lucide-react';
import CanvasRenderer, { type CanvasRendererHandle, type DrawingTool, type TextElementData, type ImageActionData } from '@/components/canvas-renderer';
import { cn } from '@/lib/utils';

const FONT_FAMILIES = ['Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Comic Sans MS', 'Impact', 'Lucida Console'];

export default function CanvasCraftPage() {
  const [strokeColor, setStrokeColor] = useState<string>('#000000');
  const [fillColor, setFillColor] = useState<string>('#79B4B7');
  const [strokeWidth, setStrokeWidth] = useState<number>(5); 
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('freehand');
  const [isFillEnabled, setIsFillEnabled] = useState<boolean>(true);

  const [fontFamily, setFontFamily] = useState<string>('Arial');
  const [fontSize, setFontSize] = useState<number>(24);
  const [textColor, setTextColor] = useState<string>('#000000');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
  const [isTextBold, setIsTextBold] = useState<boolean>(false);
  const [isTextItalic, setIsTextItalic] = useState<boolean>(false);
  const [isTextUnderline, setIsTextUnderline] = useState<boolean>(false);

  const [isTextInputVisible, setIsTextInputVisible] = useState<boolean>(false);
  const [textInputValue, setTextInputValue] = useState<string>('');
  const [textInputCoords, setTextInputCoords] = useState<{ x: number; y: number } | null>(null);
  const [currentEditingTextId, setCurrentEditingTextId] = useState<string | null>(null);

  const [previewImageData, setPreviewImageData] = useState<{ src: string; x: number; y: number; width: number; height: number} | null>(null);
  const [mouseCanvasPosition, setMouseCanvasPosition] = useState<{x: number; y: number} | null>(null);


  const canvasComponentRef = useRef<CanvasRendererHandle>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainCanvasAreaRef = useRef<HTMLDivElement>(null);


  const handleClearCanvas = useCallback(() => {
    canvasComponentRef.current?.clearCanvas();
    setCurrentEditingTextId(null);
    setIsTextInputVisible(false);
    setPreviewImageData(null);
  }, []);

  const handleDownloadDrawing = useCallback(() => {
    canvasComponentRef.current?.downloadDrawing('canvas-craft-drawing.png');
  }, []);

  const handleUndo = useCallback(() => {
    canvasComponentRef.current?.undo();
    const potentiallyDeselectedId = currentEditingTextId; 
    setCurrentEditingTextId(null); 
    setIsTextInputVisible(false);
    setPreviewImageData(null);
    if (potentiallyDeselectedId) {
        canvasComponentRef.current?.getTextElementById(potentiallyDeselectedId).then(el => {
            if(!el) {
            }
        });
    }
  }, [currentEditingTextId]);

  const handleRedo = useCallback(() => {
    canvasComponentRef.current?.redo();
    setCurrentEditingTextId(null);
    setIsTextInputVisible(false);
    setPreviewImageData(null);
  }, []);

  useEffect(() => {
    if (isTextInputVisible && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [isTextInputVisible]);
  
  const loadTextElementForEditing = useCallback(async (textId: string) => {
    const element = await canvasComponentRef.current?.getTextElementById(textId);
    if (element) {
      setTextInputValue(element.text);
      setFontFamily(element.fontFamily);
      setFontSize(element.fontSize);
      setTextColor(element.textColor);
      setTextAlign(element.textAlign);
      setIsTextBold(element.isBold);
      setIsTextItalic(element.isItalic);
      setIsTextUnderline(element.isUnderline);
      setCurrentEditingTextId(textId);
      setTextInputCoords({x: element.x, y: element.y}); 
      setIsTextInputVisible(true);
    }
  }, []);


  const handleCanvasInteraction = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    if (selectedTool === 'image' && previewImageData && canvasComponentRef.current) {
        const canvasEl = canvasComponentRef.current.getCanvasElement();
        if (!canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();
        const logicalX = event.clientX - rect.left;
        const logicalY = event.clientY - rect.top;

        canvasComponentRef.current.addImageElement({
            id: `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            src: previewImageData.src,
            x: logicalX - previewImageData.width / 2, // Center image on click
            y: logicalY - previewImageData.height / 2,
            width: previewImageData.width,
            height: previewImageData.height,
        });
        setPreviewImageData(null); 
        return; 
    }

    if (selectedTool !== 'text' || !canvasComponentRef.current) {
      setIsTextInputVisible(false); 
      setCurrentEditingTextId(null);
      return;
    }

    const canvasEl = canvasComponentRef.current.getCanvasElement();
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const logicalX = event.clientX - rect.left;
    const logicalY = event.clientY - rect.top;

    const clickedTextId = await canvasComponentRef.current?.getTextElementIdAtPoint({ x: logicalX, y: logicalY });

    if (clickedTextId) {
      await loadTextElementForEditing(clickedTextId);
    } else {
      setCurrentEditingTextId(null);
      setTextInputValue(''); 
      setTextInputCoords({ x: logicalX, y: logicalY }); 
      setIsTextInputVisible(true);
    }
  }, [selectedTool, loadTextElementForEditing, previewImageData]);


  const handleTextInputCommit = useCallback(() => {
    if (!textInputValue.trim() || !textInputCoords) {
      setIsTextInputVisible(false);
      setTextInputValue('');
      return;
    }

    const textData: Omit<TextElementData, 'id' | 'measuredWidth' | 'measuredHeight'> = {
      text: textInputValue,
      x: textInputCoords.x, 
      y: textInputCoords.y, 
      fontFamily,
      fontSize,
      textColor,
      textAlign,
      isBold: isTextBold,
      isItalic: isTextItalic,
      isUnderline: isTextUnderline,
    };

    if (currentEditingTextId) {
      canvasComponentRef.current?.updateTextElement(currentEditingTextId, {
        ...textData,
        id: currentEditingTextId,
      } as TextElementData);
    } else {
      canvasComponentRef.current?.addTextElement({
        ...textData,
        id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      } as TextElementData);
    }

    setIsTextInputVisible(false);
    setTextInputValue('');
  }, [textInputValue, textInputCoords, fontFamily, fontSize, textColor, textAlign, isTextBold, isTextItalic, isTextUnderline, currentEditingTextId]);

  useEffect(() => {
    if (currentEditingTextId && !isTextInputVisible) { 
      const updateFormatting = async () => {
        const currentElement = await canvasComponentRef.current?.getTextElementById(currentEditingTextId);
        if (currentElement) {
          const updatedData: TextElementData = {
            ...currentElement, 
            fontFamily,
            fontSize,
            textColor,
            textAlign,
            isBold: isTextBold,
            isItalic: isTextItalic,
            isUnderline: isTextUnderline,
          };
          canvasComponentRef.current?.updateTextElement(currentEditingTextId, updatedData);
        }
      };
      updateFormatting();
    }
  }, [fontFamily, fontSize, textColor, textAlign, isTextBold, isTextItalic, isTextUnderline, currentEditingTextId, isTextInputVisible]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'z') { event.preventDefault(); handleUndo(); }
        else if (event.key === 'y') { event.preventDefault(); handleRedo(); }
        else if (event.key === 'Backspace' && (event.target as HTMLElement)?.tagName !== 'INPUT' && (event.target as HTMLElement)?.tagName !== 'TEXTAREA') { event.preventDefault(); handleClearCanvas(); }
        else if (event.key === 's'  && (event.target as HTMLElement)?.tagName !== 'INPUT' && (event.target as HTMLElement)?.tagName !== 'TEXTAREA') { event.preventDefault(); handleDownloadDrawing(); }
      }
      if (isTextInputVisible) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          handleTextInputCommit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setIsTextInputVisible(false);
          setTextInputValue('');
          setCurrentEditingTextId(null); 
        }
      } else if (selectedTool === 'image' && previewImageData && event.key === 'Escape') {
          event.preventDefault();
          setPreviewImageData(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClearCanvas, handleDownloadDrawing, handleUndo, handleRedo, isTextInputVisible, handleTextInputCommit, selectedTool, previewImageData]);

  const commonInputClass = "w-10 h-10 p-0 bg-transparent border border-input rounded-md cursor-pointer appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none";
  const isShapeTool = ['rectangle', 'circle', 'triangle'].includes(selectedTool);
  
  const getTextInputStyle = () => {
    if (!isTextInputVisible || !textInputCoords || !canvasComponentRef.current) return { display: 'none' };
    const canvasEl = canvasComponentRef.current.getCanvasElement();
    if (!canvasEl) return { display: 'none' };

    const canvasRect = canvasEl.getBoundingClientRect();
    const screenX = textInputCoords.x + canvasRect.left;
    const screenY = textInputCoords.y + canvasRect.top;
    
    return {
      left: `${Math.min(window.innerWidth - 200, Math.max(10, screenX))}px`,
      top: `${Math.min(window.innerHeight - 50, Math.max(10, screenY))}px`,
      minWidth: '150px',
      maxWidth: '300px',
    };
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const src = e.target?.result as string;
            if (src) {
                const img = new Image();
                img.onload = () => {
                    setPreviewImageData({
                        src,
                        x: mouseCanvasPosition?.x ? mouseCanvasPosition.x - img.naturalWidth / 2 : 0,
                        y: mouseCanvasPosition?.y ? mouseCanvasPosition.y - img.naturalHeight / 2 : 0,
                        width: img.naturalWidth, 
                        height: img.naturalHeight,
                    });
                };
                img.src = src;
            }
        };
        reader.readAsDataURL(file);
    }
    if (event.target) {
        event.target.value = ""; // Reset file input
    }
  };

  useEffect(() => {
    if (selectedTool === 'image' && previewImageData && mouseCanvasPosition) {
        setPreviewImageData(prev => prev ? { ...prev, x: mouseCanvasPosition.x - prev.width / 2, y: mouseCanvasPosition.y - prev.height / 2 } : null);
    }
  }, [mouseCanvasPosition, selectedTool, previewImageData?.src]); // previewImageData.src to re-trigger if different image loaded

  const handleMainAreaMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!mainCanvasAreaRef.current) return;
    // Calculate mouse position relative to the mainCanvasAreaRef (parent of CanvasRenderer)
    // This position is then used to get logical canvas coords if needed by CanvasRenderer
    const areaRect = mainCanvasAreaRef.current.getBoundingClientRect();
    const canvasEl = canvasComponentRef.current?.getCanvasElement();

    if (canvasEl) {
      const canvasRect = canvasEl.getBoundingClientRect();
      // Mouse relative to viewport
      const clientX = event.clientX;
      const clientY = event.clientY;

      // Check if mouse is within the canvas bounds
      if (clientX >= canvasRect.left && clientX <= canvasRect.right &&
          clientY >= canvasRect.top && clientY <= canvasRect.bottom) {
        const logicalX = clientX - canvasRect.left;
        const logicalY = clientY - canvasRect.top;
        setMouseCanvasPosition({ x: logicalX, y: logicalY });
      } else {
        setMouseCanvasPosition(null);
      }
    } else {
       setMouseCanvasPosition(null);
    }
  };

  const handleMainAreaMouseLeave = () => {
      setMouseCanvasPosition(null);
      // If previewing an image, you might want to hide or keep it fixed
      // For now, if mouse leaves, preview might stick to last known canvas pos or disappear if mouseCanvasPosition is null
  };


  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body">
      <header className="p-2 sm:p-4">
        <Card className="shadow-lg rounded-lg border-border">
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 items-center">
              
              <div className="flex items-center gap-2" title="Drawing/Text/Eraser/Image Tool">
                <Brush className="h-6 w-6 text-primary" />
                <Select value={selectedTool} onValueChange={(value) => {
                  setSelectedTool(value as DrawingTool);
                  setIsTextInputVisible(false); 
                  setCurrentEditingTextId(null);
                  if (value === 'image') {
                      if(!previewImageData) fileInputRef.current?.click();
                  } else {
                      setPreviewImageData(null); // Clear image preview if switching away
                  }
                }}>
                  <SelectTrigger className="w-full sm:w-[180px]" aria-label="Select tool">
                    <SelectValue placeholder="Select tool" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freehand"><div className="flex items-center gap-2"><Brush className="h-4 w-4" /> Freehand</div></SelectItem>
                    <SelectItem value="line"><div className="flex items-center gap-2"><Minus className="h-4 w-4" /> Line</div></SelectItem>
                    <SelectItem value="rectangle"><div className="flex items-center gap-2"><RectangleHorizontal className="h-4 w-4" /> Rectangle</div></SelectItem>
                    <SelectItem value="circle"><div className="flex items-center gap-2"><CircleIcon className="h-4 w-4" /> Circle</div></SelectItem>
                    <SelectItem value="triangle"><div className="flex items-center gap-2"><TriangleIcon className="h-4 w-4" /> Triangle</div></SelectItem>
                    <SelectItem value="text"><div className="flex items-center gap-2"><Type className="h-4 w-4" /> Text</div></SelectItem>
                    <SelectItem value="eraser"><div className="flex items-center gap-2"><Eraser className="h-4 w-4" /> Eraser</div></SelectItem>
                    <SelectItem value="image"><div className="flex items-center gap-2"><ImagePlus className="h-4 w-4" /> Image</div></SelectItem>
                  </SelectContent>
                </Select>
                 <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
              </div>
              
              {selectedTool !== 'text' && selectedTool !== 'image' && (
                <>
                  {selectedTool !== 'eraser' && (
                    <div className="flex items-center gap-2" title="Stroke Color">
                      <Palette className="h-6 w-6 text-primary" />
                      <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} className={commonInputClass} aria-label="Select stroke color"/>
                    </div>
                  )}

                  {isShapeTool && (
                    <>
                    <div className="flex items-center gap-2" title="Fill Color">
                      <PaintBucket className="h-6 w-6 text-primary" />
                      <input type="color" value={fillColor} onChange={(e) => setFillColor(e.target.value)} className={commonInputClass} aria-label="Select fill color"/>
                    </div>
                     <div className="flex items-center gap-2" title="Fill Shape">
                        <Checkbox id="fillShape" checked={isFillEnabled} onCheckedChange={(checked) => setIsFillEnabled(checked as boolean)} aria-label="Toggle fill for shapes"/>
                        <Label htmlFor="fillShape">Fill Shape</Label>
                      </div>
                    </>
                  )}
                  
                  <div className="flex items-center gap-2" title={`${selectedTool === 'eraser' ? 'Eraser Size' : 'Brush/Eraser Size'}: ${strokeWidth}px`}>
                    <Paintbrush className="h-6 w-6 text-primary" />
                    <Slider 
                        min={1} 
                        max={selectedTool === 'eraser' ? 100 : 50} 
                        step={1} 
                        value={[strokeWidth]} 
                        onValueChange={(val) => setStrokeWidth(val[0])} 
                        className="w-full min-w-[100px] sm:min-w-[150px]" 
                        aria-label={`${selectedTool === 'eraser' ? 'Eraser size' : 'Brush/Eraser Size'}: ${strokeWidth}px`}
                    />
                    <span className="text-sm w-8 text-center select-none">{strokeWidth}</span>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 sm:gap-3 md:col-start-2 lg:col-start-3 xl:col-start-auto">
                <Button variant="outline" onClick={handleUndo} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
                  <Undo2 className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Undo</span>
                </Button>
                <Button variant="outline" onClick={handleRedo} aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)">
                  <Redo2 className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Redo</span>
                </Button>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3">
                <Button variant="outline" onClick={handleClearCanvas} aria-label="Clear Canvas (Ctrl+Backspace)" title="Clear Canvas (Ctrl+Backspace)">
                  <Trash2 className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Clear</span>
                </Button>
                <Button onClick={handleDownloadDrawing} aria-label="Download (Ctrl+S)" title="Download Drawing (Ctrl+S)">
                  <Download className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Download</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </header>
      
      {selectedTool === 'text' && (
        <aside className="p-2 sm:px-4 sm:pb-2">
          <Card className="shadow-md rounded-lg border-border">
            <CardHeader className="p-2 pb-1 sm:p-3 sm:pb-2">
                <CardTitle className="text-base sm:text-lg">Text Formatting</CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-1 sm:p-3 sm:pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 items-center">
                <div className="flex items-center gap-2" title="Font Family">
                  <Label htmlFor="fontFamilySelect" className="text-sm">Font</Label>
                  <Select value={fontFamily} onValueChange={setFontFamily}>
                    <SelectTrigger id="fontFamilySelect" className="w-full min-w-[120px] h-9 text-xs sm:text-sm" aria-label="Select font family">
                      <SelectValue placeholder="Font" />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_FAMILIES.map(font => <SelectItem key={font} value={font} className="text-xs sm:text-sm">{font}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2" title="Font Size">
                   <Label htmlFor="fontSizeInput" className="text-sm">Size</Label>
                  <Input id="fontSizeInput" type="number" value={fontSize} onChange={(e) => setFontSize(Math.max(1, parseInt(e.target.value,10) || 10))} className="w-16 h-9 text-xs sm:text-sm" aria-label="Font size"/>
                </div>
                <div className="flex items-center gap-2" title="Text Color">
                  <Label htmlFor="textColorPicker" className="text-sm">Color</Label>
                  <input type="color" id="textColorPicker" value={textColor} onChange={(e) => setTextColor(e.target.value)} className={cn(commonInputClass, "w-9 h-9 sm:w-10 sm:h-10")} aria-label="Select text color"/>
                </div>
                <div className="flex items-center gap-2" title="Text Alignment">
                  <Label className="text-sm">Align</Label>
                  <div className="flex gap-1">
                    <Button variant={textAlign === 'left' ? 'secondary' : 'outline'} size="icon" onClick={() => setTextAlign('left')} className="h-8 w-8 sm:h-9 sm:w-9" aria-label="Align left"><AlignLeft className="h-4 w-4"/></Button>
                    <Button variant={textAlign === 'center' ? 'secondary' : 'outline'} size="icon" onClick={() => setTextAlign('center')} className="h-8 w-8 sm:h-9 sm:w-9" aria-label="Align center"><AlignCenter className="h-4 w-4"/></Button>
                    <Button variant={textAlign === 'right' ? 'secondary' : 'outline'} size="icon" onClick={() => setTextAlign('right')} className="h-8 w-8 sm:h-9 sm:w-9" aria-label="Align right"><AlignRight className="h-4 w-4"/></Button>
                  </div>
                </div>
                <div className="flex items-center gap-3" title="Text Styles">
                  <Label className="text-sm">Style</Label>
                  <div className="flex gap-1">
                    <Button variant={isTextBold ? 'secondary' : 'outline'} size="icon" onClick={() => setIsTextBold(!isTextBold)} className="h-8 w-8 sm:h-9 sm:w-9" aria-label="Bold"><BoldIcon className="h-4 w-4"/></Button>
                    <Button variant={isTextItalic ? 'secondary' : 'outline'} size="icon" onClick={() => setIsTextItalic(!isTextItalic)} className="h-8 w-8 sm:h-9 sm:w-9" aria-label="Italic"><ItalicIcon className="h-4 w-4"/></Button>
                    <Button variant={isTextUnderline ? 'secondary' : 'outline'} size="icon" onClick={() => setIsTextUnderline(!isTextUnderline)} className="h-8 w-8 sm:h-9 sm:w-9" aria-label="Underline"><UnderlineIcon className="h-4 w-4"/></Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      )}
      {selectedTool === 'image' && !previewImageData && (
         <aside className="p-2 sm:px-4 sm:pb-2">
            <Card className="shadow-md rounded-lg border-border">
                 <CardContent className="p-3 text-center">
                    <p className="text-sm text-muted-foreground">Select an image to place on the canvas.</p>
                    <Button onClick={() => fileInputRef.current?.click()} className="mt-2">Upload Image</Button>
                 </CardContent>
            </Card>
        </aside>
      )}


      <main 
        ref={mainCanvasAreaRef}
        className="flex-1 mx-2 mb-2 sm:mx-4 sm:mb-4 mt-0 p-0 overflow-hidden relative"
        onMouseMove={handleMainAreaMouseMove}
        onMouseLeave={handleMainAreaMouseLeave}
      >
        <div 
          className="w-full h-full bg-white rounded-lg shadow-inner overflow-hidden border border-border"
          onClick={(selectedTool === 'text' || (selectedTool === 'image' && previewImageData)) ? handleCanvasInteraction : undefined} 
        >
           <CanvasRenderer
            ref={canvasComponentRef}
            tool={selectedTool}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth} 
            fillColor={fillColor}
            isFillEnabled={isFillEnabled}
            currentEditingTextId={currentEditingTextId}
            previewImage={previewImageData}
            onTextDragEnd={(id, x, y, textElement) => { 
                if (textElement) {
                    const updatedData: TextElementData = { ...textElement, x, y };
                    canvasComponentRef.current?.updateTextElement(id, updatedData);
                    setCurrentEditingTextId(id); 
                    loadTextElementForEditing(id);
                }
            }}
             onTextSelect={(id) => { 
                setSelectedTool('text'); 
                loadTextElementForEditing(id);
             }}
          />
        </div>
        {isTextInputVisible && textInputCoords && (
          <Input
            ref={textInputRef}
            type="text"
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onBlur={handleTextInputCommit} 
            className="absolute z-10 bg-background border border-primary shadow-lg p-2 rounded-md text-sm"
            style={getTextInputStyle()}
            placeholder="Type text here..."
          />
        )}
      </main>
    </div>
  );
}
