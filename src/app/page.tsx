
"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { CanvasSheet, DrawingAction, DrawingTool, TextElementData, ImageActionData, Point, ShapeAction, TextAction, ShapeAction } from '@/lib/types';
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette, Paintbrush, Trash2, Download, Undo2, Redo2, PaintBucket, Minus, RectangleHorizontal, Circle as CircleIcon, Triangle as TriangleIcon, Brush, Type, AlignLeft, AlignCenter, AlignRight, Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, Eraser, ImagePlus, Square, Menu } from 'lucide-react';
import CanvasRenderer, { type CanvasRendererHandle } from '@/components/canvas-renderer';
import { SheetTabs } from '@/components/sheet-tabs';
import { HistorySidebar } from '@/components/history-sidebar';
import { Sheet as ShadcnSheet, SheetContent, SheetTrigger } from "@/components/ui/sheet" // For sidebar
import { cn } from '@/lib/utils';

const FONT_FAMILIES = ['Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Comic Sans MS', 'Impact', 'Lucida Console'];
const DEFAULT_SHEET_NAME = "Sheet";

interface PendingImageState {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: number;
  currentX: number;
  currentY: number;
  currentWidth: number;
  currentHeight: number;
}

interface ImageDragInteractionState {
  active: boolean;
  type: 'move' | 'resize-br' | null;
  startMouseX: number;
  startMouseY: number;
  initialElementX: number;
  initialElementY: number;
  initialElementWidth: number;
  initialElementHeight: number;
}

const createNewSheet = (name?: string, existingHistory?: DrawingAction[], existingHistoryIndex?: number): CanvasSheet => {
  const id = `sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return {
    id,
    name: name || `${DEFAULT_SHEET_NAME} ${id.slice(-4)}`,
    drawingHistory: existingHistory || [],
    historyIndex: existingHistoryIndex !== undefined ? existingHistoryIndex : -1,
  };
};


export default function CanvasCraftPage() {
  const [sheets, setSheets] = useState<CanvasSheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);

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
  const [textInputCoords, setTextInputCoords] = useState<Point | null>(null);
  const [currentEditingTextId, setCurrentEditingTextId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  const [pendingImage, setPendingImage] = useState<PendingImageState | null>(null);
  const [imageDragState, setImageDragState] = useState<ImageDragInteractionState>({
    active: false, type: null, startMouseX: 0, startMouseY: 0,
    initialElementX: 0, initialElementY: 0, initialElementWidth: 0, initialElementHeight: 0,
  });

  const canvasComponentRef = useRef<CanvasRendererHandle>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainCanvasAreaRef = useRef<HTMLDivElement>(null);
  const imagePreviewDivRef = useRef<HTMLDivElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    // Initialize the first sheet on client-side mount
    if (sheets.length === 0) {
      const initialSheet = createNewSheet(DEFAULT_SHEET_NAME + " 1");
      setSheets([initialSheet]);
      setActiveSheetId(initialSheet.id);
    }
  }, [sheets.length]); // Only run when sheets.length changes from 0


  const activeSheet = activeSheetId ? sheets.find(s => s.id === activeSheetId) : null;

  const updateSheetHistory = (sheetId: string, newHistory: DrawingAction[], newIndex: number) => {
    setSheets(prevSheets => prevSheets.map(s =>
      s.id === sheetId ? { ...s, drawingHistory: newHistory, historyIndex: newIndex } : s
    ));
  };

  const handleCommitAction = useCallback((actionData: Omit<DrawingAction, 'id' | 'visible'>) => {
    if (!activeSheetId || !activeSheet) return;

    const newActionId = actionData.type === 'text' && (actionData.data as TextElementData).id ? (actionData.data as TextElementData).id
                       : actionData.type === 'image' && (actionData.data as ImageActionData).id ? (actionData.data as ImageActionData).id
                       : (selectedShapeId && (actionData.type === 'rectangle' || actionData.type === 'circle' || actionData.type === 'triangle')) ? selectedShapeId // reuse ID for shape updates
                       : `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newAction: DrawingAction = {
      ...actionData,
      id: newActionId,
      visible: true,
    } as DrawingAction;

    const currentHistory = activeSheet.drawingHistory.slice(0, activeSheet.historyIndex + 1);
    const newHistory = [...currentHistory, newAction];
    updateSheetHistory(activeSheetId, newHistory, newHistory.length - 1);
    
    if (actionData.type !== 'text' || (actionData.data as TextElementData).id !== currentEditingTextId) {
        setCurrentEditingTextId(null);
    }
    // Keep selectedShapeId if the action was an update to that shape
    if (newAction.id !== selectedShapeId && actionData.type !== 'text') {
        setSelectedShapeId(null);
    }

  }, [activeSheet, activeSheetId, currentEditingTextId, selectedShapeId]);


  const handleClearCanvas = useCallback(() => {
    if (!activeSheetId) return;
    updateSheetHistory(activeSheetId, [], -1);
    setCurrentEditingTextId(null);
    setSelectedShapeId(null);
    setIsTextInputVisible(false);
    setPendingImage(null);
  }, [activeSheetId]);

  const handleDownloadDrawing = useCallback(() => {
    if (!activeSheet) return;
    canvasComponentRef.current?.downloadDrawing(`${activeSheet.name.replace(/\s+/g, '_') || 'canvas-craft'}.png`);
  }, [activeSheet]);

  const handleUndo = useCallback(() => {
    if (!activeSheet || !activeSheetId || activeSheet.historyIndex < 0) return;
    updateSheetHistory(activeSheetId, activeSheet.drawingHistory, activeSheet.historyIndex - 1);
    setCurrentEditingTextId(null);
    setSelectedShapeId(null);
    setIsTextInputVisible(false);
  }, [activeSheet, activeSheetId]);

  const handleRedo = useCallback(() => {
    if (!activeSheet || !activeSheetId || activeSheet.historyIndex >= activeSheet.drawingHistory.length - 1) return;
    updateSheetHistory(activeSheetId, activeSheet.drawingHistory, activeSheet.historyIndex + 1);
    setCurrentEditingTextId(null);
    setSelectedShapeId(null);
    setIsTextInputVisible(false);
  }, [activeSheet, activeSheetId]);


  useEffect(() => {
    if (isTextInputVisible && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [isTextInputVisible]);

  const loadTextElementForEditing = useCallback(async (textId: string) => {
    if (!activeSheet) return;
    const action = activeSheet.drawingHistory
        .slice(0, activeSheet.historyIndex + 1)
        .reverse()
        .find(a => a.id === textId && a.type === 'text') as TextAction | undefined;

    if (action && action.data) {
      const element = action.data;
      setTextInputValue(element.text);
      setFontFamily(element.fontFamily);
      setFontSize(element.fontSize);
      setTextColor(element.textColor);
      setTextAlign(element.textAlign);
      setIsTextBold(element.isBold);
      setIsTextItalic(element.isItalic);
      setIsTextUnderline(element.isUnderline);
      setCurrentEditingTextId(textId);
      setSelectedShapeId(null);
      setTextInputCoords({x: element.x, y: element.y});
      setIsTextInputVisible(true);
    }
  }, [activeSheet]);

  const handleCanvasInteraction = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!activeSheet) return;
    if (selectedTool === 'image' && pendingImage) return;
    if (selectedTool !== 'text' || !canvasComponentRef.current) {
      setIsTextInputVisible(false);
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
      setSelectedShapeId(null); 
      setTextInputValue(''); 
      setTextInputCoords({ x: logicalX, y: logicalY });
      setIsTextInputVisible(true);
    }
  }, [selectedTool, loadTextElementForEditing, pendingImage, activeSheet]);


  const handleTextInputCommit = useCallback(() => {
    if (!textInputValue.trim() || !textInputCoords) {
      setIsTextInputVisible(false);
      setTextInputValue('');
      return;
    }

    const textDataForAction: TextElementData = {
      id: currentEditingTextId || `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: textInputValue,
      x: textInputCoords.x, y: textInputCoords.y, fontFamily, fontSize, textColor,
      textAlign, isBold: isTextBold, isItalic: isTextItalic, isUnderline: isTextUnderline,
      measuredWidth: 0, measuredHeight: 0,
    };

    handleCommitAction({
      type: 'text',
      data: textDataForAction,
    });

    setIsTextInputVisible(false);
    setTextInputValue('');
  }, [textInputValue, textInputCoords, fontFamily, fontSize, textColor, textAlign, isTextBold, isTextItalic, isTextUnderline, currentEditingTextId, handleCommitAction]);

  useEffect(() => {
    if (!activeSheet) return;
    const isTextToolActive = selectedTool === 'text';
    
    if (currentEditingTextId && isTextToolActive && !isTextInputVisible) {
        const latestAction = activeSheet.drawingHistory
            .slice(0, activeSheet.historyIndex + 1)
            .reverse()
            .find(a => a.id === currentEditingTextId && a.type === 'text') as TextAction | undefined;

        if (latestAction) {
            const updatedTextData: TextElementData = {
                ...latestAction.data,
                fontFamily, fontSize, textColor, textAlign,
                isBold: isTextBold, isItalic: isTextItalic, isUnderline: isTextUnderline,
            };
            handleCommitAction({ type: 'text', data: updatedTextData });
        }
    } else if (selectedShapeId && !isTextToolActive) {
        const latestAction = activeSheet.drawingHistory
            .slice(0, activeSheet.historyIndex + 1)
            .reverse()
            .find(a => a.id === selectedShapeId && (a.type === 'rectangle' || a.type === 'circle' || a.type === 'triangle')) as ShapeAction | undefined;

        if (latestAction) {
            if (latestAction.fillColor !== fillColor ||
                latestAction.strokeColor !== strokeColor ||
                latestAction.strokeWidth !== strokeWidth ||
                latestAction.isFilled !== isFillEnabled) {
                
                const updatedShapeActionData: Omit<ShapeAction, 'id' | 'visible'> = {
                    type: latestAction.type,
                    startPoint: latestAction.startPoint,
                    endPoint: latestAction.endPoint,
                    strokeColor: strokeColor,
                    strokeWidth: strokeWidth,
                    fillColor: fillColor,
                    isFilled: isFillEnabled,
                };
                handleCommitAction(updatedShapeActionData);
            }
        }
    }
  }, [
    fontFamily, fontSize, textColor, textAlign, isTextBold, isTextItalic, isTextUnderline, 
    fillColor, strokeColor, strokeWidth, isFillEnabled, 
    currentEditingTextId, selectedShapeId, isTextInputVisible, selectedTool,
    activeSheet, handleCommitAction
  ]);


  const handlePlaceImage = () => {
    if (pendingImage) {
      handleCommitAction({
        type: 'image',
        data: {
          id: `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          src: pendingImage.src,
          x: pendingImage.currentX,
          y: pendingImage.currentY,
          width: pendingImage.currentWidth,
          height: pendingImage.currentHeight,
        }
      });
      setPendingImage(null);
    }
  };

  const handleCancelImage = () => {
    setPendingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  useEffect(() => {
    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (!imageDragState.active || !pendingImage || !mainCanvasAreaRef.current) return;
      event.preventDefault();

      const mainRect = mainCanvasAreaRef.current.getBoundingClientRect();
      const mouseXInArea = event.clientX - mainRect.left;
      const mouseYInArea = event.clientY - mainRect.top;

      const deltaX = mouseXInArea - imageDragState.startMouseX;
      const deltaY = mouseYInArea - imageDragState.startMouseY;

      if (imageDragState.type === 'move') {
        setPendingImage(prev => prev ? {
          ...prev,
          currentX: imageDragState.initialElementX + deltaX,
          currentY: imageDragState.initialElementY + deltaY,
        } : null);
      } else if (imageDragState.type === 'resize-br') {
        let newWidth = imageDragState.initialElementWidth + deltaX;
        let newHeight = imageDragState.initialElementHeight + deltaY;
        if (newWidth / pendingImage.aspectRatio > newHeight) {
            newHeight = newWidth / pendingImage.aspectRatio;
        } else {
            newWidth = newHeight * pendingImage.aspectRatio;
        }
        newWidth = Math.max(20, newWidth);
        newHeight = Math.max(20, newHeight);
        setPendingImage(prev => prev ? { ...prev, currentWidth: newWidth, currentHeight: newHeight } : null);
      }
    };
    const handleGlobalMouseUp = () => {
      if (imageDragState.active) setImageDragState(prev => ({ ...prev, active: false, type: null }));
    };
    if (imageDragState.active) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [imageDragState, pendingImage]);


  const onImagePreviewMouseDown = (event: React.MouseEvent<HTMLDivElement>, type: 'move' | 'resize-br') => {
    if (!pendingImage || !mainCanvasAreaRef.current) return;
    event.preventDefault(); event.stopPropagation();
    const mainRect = mainCanvasAreaRef.current.getBoundingClientRect();
    const startMouseX = event.clientX - mainRect.left;
    const startMouseY = event.clientY - mainRect.top;
    setImageDragState({
      active: true, type, startMouseX, startMouseY,
      initialElementX: pendingImage.currentX, initialElementY: pendingImage.currentY,
      initialElementWidth: pendingImage.currentWidth, initialElementHeight: pendingImage.currentHeight,
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const targetTagName = (event.target as HTMLElement)?.tagName;
      const isInputFocused = targetTagName === 'INPUT' || targetTagName === 'TEXTAREA' || targetTagName === 'SELECT';


      if ((event.ctrlKey || event.metaKey) && !isInputFocused) {
        if (event.key === 'z') { event.preventDefault(); handleUndo(); }
        else if (event.key === 'y') { event.preventDefault(); handleRedo(); }
        else if (event.key === 'Backspace' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); handleClearCanvas(); }
        else if (event.key === 's') { event.preventDefault(); handleDownloadDrawing(); }
      }
      if (isTextInputVisible) {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleTextInputCommit(); }
        else if (event.key === 'Escape') {
          event.preventDefault(); setIsTextInputVisible(false); setTextInputValue(''); 
        }
      } else if (selectedTool === 'image' && pendingImage && event.key === 'Escape') {
          event.preventDefault(); handleCancelImage();
      } else if (!isInputFocused && event.key === 'Escape') { 
          setCurrentEditingTextId(null);
          setSelectedShapeId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClearCanvas, handleDownloadDrawing, handleUndo, handleRedo, isTextInputVisible, handleTextInputCommit, selectedTool, pendingImage]);

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
      position: 'fixed' as 'fixed',
      left: `${Math.min(window.innerWidth - 200, Math.max(10, screenX))}px`,
      top: `${Math.min(window.innerHeight - 50, Math.max(10, screenY))}px`,
      minWidth: '150px', maxWidth: '300px',
    };
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && mainCanvasAreaRef.current && canvasComponentRef.current?.getCanvasElement()) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const src = e.target?.result as string;
            if (src) {
                const img = new Image();
                img.onload = () => {
                    const canvasEl = canvasComponentRef.current!.getCanvasElement()!;
                    const logicalCanvasWidth = canvasEl.width / (window.devicePixelRatio || 1);
                    const logicalCanvasHeight = canvasEl.height / (window.devicePixelRatio || 1);

                    const aspectRatio = img.naturalWidth / img.naturalHeight;
                    let initialWidth = Math.min(img.naturalWidth, logicalCanvasWidth * 0.5);
                    let initialHeight = initialWidth / aspectRatio;
                    if (initialHeight > logicalCanvasHeight * 0.5) {
                        initialHeight = logicalCanvasHeight * 0.5;
                        initialWidth = initialHeight * aspectRatio;
                    }
                    setPendingImage({
                        src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, aspectRatio,
                        currentX: (logicalCanvasWidth - initialWidth) / 2, currentY: (logicalCanvasHeight - initialHeight) / 2,
                        currentWidth: initialWidth, currentHeight: initialHeight,
                    });
                    setSelectedShapeId(null); 
                    setCurrentEditingTextId(null); 
                };
                img.src = src;
            }
        };
        reader.readAsDataURL(file);
    }
    if (event.target) event.target.value = "";
  };

  const handleAddSheet = () => {
    const newSheet = createNewSheet();
    setSheets(prev => [...prev, newSheet]);
    setActiveSheetId(newSheet.id);
  };
  const handleSwitchSheet = (sheetId: string) => {
    setActiveSheetId(sheetId);
    setCurrentEditingTextId(null);
    setSelectedShapeId(null);
    setIsTextInputVisible(false);
    setPendingImage(null);
  };
  const handleRenameSheet = (sheetId: string, newName: string) => {
    setSheets(prev => prev.map(s => s.id === sheetId ? { ...s, name: newName } : s));
  };
  const handleDuplicateSheet = (sheetId: string) => {
    const sheetToDuplicate = sheets.find(s => s.id === sheetId);
    if (sheetToDuplicate) {
      const newSheet = createNewSheet(
        `${sheetToDuplicate.name} (Copy)`,
        [...sheetToDuplicate.drawingHistory],
        sheetToDuplicate.historyIndex
      );
      setSheets(prev => [...prev, newSheet]);
      setActiveSheetId(newSheet.id);
    }
  };
  const handleDeleteSheet = (sheetId: string) => {
    if (sheets.length <= 1) return; // Cannot delete the last sheet
    const sheetIndexToDelete = sheets.findIndex(s => s.id === sheetId);
    if (sheetIndexToDelete === -1) return;

    setSheets(prev => prev.filter(s => s.id !== sheetId));
    if (activeSheetId === sheetId) {
        // Determine new active sheet: one before, or first, or null if all deleted (though we prevent last delete)
        const newActiveSheet = sheets[sheetIndexToDelete -1] || sheets[0];
        setActiveSheetId(newActiveSheet ? newActiveSheet.id : (sheets.length > 1 ? sheets.find(s => s.id !== sheetId)!.id : null));
    }
  };

  const handleToggleHistoryVisibility = (actionId: string) => {
    if (!activeSheetId || !activeSheet) return;
    const newHistory = activeSheet.drawingHistory.map(action =>
      action.id === actionId ? { ...action, visible: !(action.visible !== false) } : action
    );
    updateSheetHistory(activeSheetId, newHistory, activeSheet.historyIndex);
  };

  const handleDeleteHistoryItem = (actionId: string) => {
    handleToggleHistoryVisibility(actionId); 
  };

  const handleSelectHistoryItemForEditing = (actionId: string, type: DrawingAction['type']) => {
    if (!activeSheet) return;
    if (type === 'text') {
      setSelectedTool('text');
      loadTextElementForEditing(actionId);
    } else if (type === 'rectangle' || type === 'circle' || type === 'triangle') {
        const latestAction = activeSheet.drawingHistory
            .slice(0, activeSheet.historyIndex + 1)
            .reverse()
            .find(a => a.id === actionId && (a.type === 'rectangle' || a.type === 'circle' || a.type === 'triangle') && a.visible !== false) as ShapeAction | undefined;
        if (latestAction) {
            setSelectedShapeId(actionId);
            setFillColor(latestAction.fillColor || '#79B4B7');
            setStrokeColor(latestAction.strokeColor);
            setStrokeWidth(latestAction.strokeWidth);
            setIsFillEnabled(latestAction.isFilled !== undefined ? latestAction.isFilled : true);
            setCurrentEditingTextId(null);
            setIsTextInputVisible(false);
            setSelectedTool(latestAction.type);
        }
    }
  };
  
  const handleShapeSelect = (id: string, data: ShapeAction) => {
    setSelectedShapeId(id);
    setFillColor(data.fillColor || '#79B4B7'); 
    setStrokeColor(data.strokeColor);
    setStrokeWidth(data.strokeWidth);
    setIsFillEnabled(data.isFilled !== undefined ? data.isFilled : true); 
    setCurrentEditingTextId(null); 
    setIsTextInputVisible(false);
    setSelectedTool(data.type); 
  };


  const currentTextFormatting = { fontFamily, fontSize, textColor, textAlign, isBold: isTextBold, isItalic: isTextItalic, isUnderline: isTextUnderline };

  if (!activeSheetId || !activeSheet) {
    // Render a loading state or minimal UI until the first sheet is initialized
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
            <p>Loading CanvasCraft...</p>
            {/* Optionally, a spinner component here */}
        </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground font-body">
      <ShadcnSheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent side="left" className="w-[300px] sm:w-[350px] p-0 border-r">
            <HistorySidebar
                history={activeSheet.drawingHistory.slice(0, activeSheet.historyIndex + 1)}
                onToggleVisibility={handleToggleHistoryVisibility}
                onDeleteItem={handleDeleteHistoryItem}
                onSelectItemForEditing={handleSelectHistoryItemForEditing}
                className="h-full"
            />
        </SheetContent>
      </ShadcnSheet>

      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="p-2 sm:p-4 border-b">
            <div className="flex items-center mb-2">
                 <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)} className="mr-2 md:hidden">
                    <Menu className="h-5 w-5" />
                </Button>
                <h1 className="text-xl sm:text-2xl font-semibold text-primary mr-auto">CanvasCraft</h1>
            </div>
          <Card className="shadow-lg rounded-lg border-border">
            <CardContent className="p-3 sm:p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 items-center">
                <div className="flex items-center gap-2" title="Drawing/Text/Eraser/Image Tool">
                  <Brush className="h-6 w-6 text-primary" />
                  <Select value={selectedTool} onValueChange={(value) => {
                    setSelectedTool(value as DrawingTool);
                    setIsTextInputVisible(false); 
                    if (value === 'image' && !pendingImage) { fileInputRef.current?.click(); }
                    else if (value !== 'image' && pendingImage) { handleCancelImage(); }
                    // Deselect shape/text if switching to a non-editing tool or different category
                    if (value !== 'text') setCurrentEditingTextId(null);
                    if (value !== 'rectangle' && value !== 'circle' && value !== 'triangle') setSelectedShapeId(null);
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
                    {(isShapeTool || selectedShapeId) && selectedTool !== 'line' && selectedTool !== 'freehand' && selectedTool !== 'eraser' && (
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
                      <Slider min={1} max={selectedTool === 'eraser' ? 100 : 50} step={1} value={[strokeWidth]} onValueChange={(val) => setStrokeWidth(val[0])} className="w-full min-w-[100px] sm:min-w-[150px]" aria-label={`${selectedTool === 'eraser' ? 'Eraser size' : 'Brush/Eraser Size'}: ${strokeWidth}px`} />
                      <span className="text-sm w-8 text-center select-none">{strokeWidth}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center gap-2 sm:gap-3 md:col-start-2 lg:col-start-3 xl:col-start-auto">
                  <Button variant="outline" onClick={handleUndo} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!activeSheet || activeSheet.historyIndex < 0}>
                    <Undo2 className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Undo</span>
                  </Button>
                  <Button variant="outline" onClick={handleRedo} aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)" disabled={!activeSheet || activeSheet.historyIndex >= activeSheet.drawingHistory.length -1}>
                    <Redo2 className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Redo</span>
                  </Button>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <Button variant="outline" onClick={handleClearCanvas} aria-label="Clear Canvas (Ctrl+Backspace)" title="Clear Canvas (Ctrl+Backspace)" disabled={!activeSheet}>
                    <Trash2 className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Clear</span>
                  </Button>
                  <Button onClick={handleDownloadDrawing} aria-label="Download (Ctrl+S)" title="Download Drawing (Ctrl+S)" disabled={!activeSheet}>
                    <Download className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Download</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </header>
        {selectedTool === 'text' && (
          <aside className="p-2 sm:px-4 sm:pb-2 border-b">
            <Card className="shadow-md rounded-lg border-border">
              <CardHeader className="p-2 pb-1 sm:p-3 sm:pb-2"><CardTitle className="text-base sm:text-lg">Text Formatting</CardTitle></CardHeader>
              <CardContent className="p-2 pt-1 sm:p-3 sm:pt-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 items-center">
                  <div className="flex items-center gap-2" title="Font Family">
                    <Label htmlFor="fontFamilySelect" className="text-sm">Font</Label>
                    <Select value={fontFamily} onValueChange={setFontFamily}>
                      <SelectTrigger id="fontFamilySelect" className="w-full min-w-[120px] h-9 text-xs sm:text-sm" aria-label="Select font family"><SelectValue placeholder="Font" /></SelectTrigger>
                      <SelectContent>{FONT_FAMILIES.map(font => <SelectItem key={font} value={font} className="text-xs sm:text-sm">{font}</SelectItem>)}</SelectContent>
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
        {selectedTool === 'image' && (
           <aside className="p-2 sm:px-4 sm:pb-2 border-b">
              <Card className="shadow-md rounded-lg border-border">
                   <CardHeader className="p-2 pb-1 sm:p-3 sm:pb-2"><CardTitle className="text-base sm:text-lg">Image Options</CardTitle></CardHeader>
                   <CardContent className="p-3 text-center">
                      {!pendingImage ? (
                          <>
                              <p className="text-sm text-muted-foreground">Select an image to place on the canvas.</p>
                              <Button onClick={() => fileInputRef.current?.click()} className="mt-2">Upload Image</Button>
                          </>
                      ) : (
                          <div className="flex flex-col items-center gap-4">
                              <p className="text-sm text-muted-foreground">Click and drag image to move. Use handles to resize.</p>
                               <div className="flex gap-2 items-center">
                                  <Label htmlFor="imgWidth" className="text-sm">W:</Label>
                                  <Input id="imgWidth" type="number" value={Math.round(pendingImage.currentWidth)}
                                         onChange={(e) => {
                                             const newWidth = parseInt(e.target.value, 10);
                                             if (!isNaN(newWidth) && newWidth > 0) {
                                                 setPendingImage(p => p ? {...p, currentWidth: newWidth, currentHeight: newWidth / p.aspectRatio} : null);
                                             }
                                         }}
                                         className="w-20 h-9 text-xs"
                                  />
                                  <Label htmlFor="imgHeight" className="text-sm">H:</Label>
                                  <Input id="imgHeight" type="number" value={Math.round(pendingImage.currentHeight)}
                                         onChange={(e) => {
                                              const newHeight = parseInt(e.target.value, 10);
                                              if (!isNaN(newHeight) && newHeight > 0) {
                                                  setPendingImage(p => p ? {...p, currentHeight: newHeight, currentWidth: newHeight * p.aspectRatio} : null);
                                              }
                                         }}
                                         className="w-20 h-9 text-xs"
                                  />
                              </div>
                              <div className="flex gap-2">
                                  <Button onClick={handlePlaceImage} variant="default">Place Image</Button>
                                  <Button onClick={handleCancelImage} variant="outline">Cancel</Button>
                              </div>
                          </div>
                      )}
                   </CardContent>
              </Card>
          </aside>
        )}

        <SheetTabs
          sheets={sheets}
          activeSheetId={activeSheetId}
          onAddSheet={handleAddSheet}
          onSwitchSheet={handleSwitchSheet}
          onRenameSheet={handleRenameSheet}
          onDuplicateSheet={handleDuplicateSheet}
          onDeleteSheet={handleDeleteSheet}
          className="shrink-0"
        />

        <main ref={mainCanvasAreaRef} className="flex-1 mx-2 mb-2 sm:mx-4 sm:mb-4 mt-2 p-0 overflow-hidden relative">
          <div className="w-full h-full bg-white rounded-lg shadow-inner overflow-hidden border border-border"
            onClick={ (selectedTool === 'text' && !pendingImage && !selectedShapeId) ? handleCanvasInteraction : undefined}
          >
             <CanvasRenderer
              key={activeSheetId || 'loading-canvas'} 
              ref={canvasComponentRef}
              drawingHistory={activeSheet ? activeSheet.drawingHistory : []}
              historyIndex={activeSheet ? activeSheet.historyIndex : -1}
              tool={selectedTool}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              fillColor={fillColor}
              isFillEnabled={isFillEnabled}
              currentTextFormatting={currentTextFormatting}
              currentEditingTextId={currentEditingTextId}
              selectedShapeId={selectedShapeId}
              onCommitAction={handleCommitAction}
              onTextSelect={(id) => { setSelectedTool('text'); loadTextElementForEditing(id); }}
              onShapeSelect={handleShapeSelect}
              onTextDragEnd={(id, x, y, textElement) => {
                  if (textElement) {
                    const updatedData: TextElementData = { ...textElement, x, y };
                     handleCommitAction({type: 'text', data: updatedData });
                     setCurrentEditingTextId(id);
                     loadTextElementForEditing(id);
                  }
              }}
            />
          </div>
          {pendingImage && (
              <div
                  ref={imagePreviewDivRef}
                  className="absolute border-2 border-dashed border-primary cursor-move select-none bg-white/50"
                  style={{
                      left: `${pendingImage.currentX}px`,
                      top: `${pendingImage.currentY}px`,
                      width: `${pendingImage.currentWidth}px`,
                      height: `${pendingImage.currentHeight}px`,
                      touchAction: 'none',
                  }}
                  onMouseDown={(e) => onImagePreviewMouseDown(e, 'move')}
              >
                  <img src={pendingImage.src} alt="Preview" className="w-full h-full object-contain pointer-events-none" />
                  <div
                      className="absolute -bottom-2 -right-2 w-4 h-4 bg-primary rounded-full cursor-se-resize border-2 border-background shadow-md"
                      onMouseDown={(e) => onImagePreviewMouseDown(e, 'resize-br')}
                      onTouchStart={(e) => {
                          e.stopPropagation();
                          if (!pendingImage || !mainCanvasAreaRef.current) return;
                          const touch = e.touches[0];
                          const mainRect = mainCanvasAreaRef.current.getBoundingClientRect();
                          setImageDragState({
                              active: true, type: 'resize-br',
                              startMouseX: touch.clientX - mainRect.left,
                              startMouseY: touch.clientY - mainRect.top,
                              initialElementX: pendingImage.currentX, initialElementY: pendingImage.currentY,
                              initialElementWidth: pendingImage.currentWidth, initialElementHeight: pendingImage.currentHeight,
                          });
                      }}
                  />
              </div>
          )}
          {isTextInputVisible && textInputCoords && (
            <Input
              ref={textInputRef} type="text" value={textInputValue}
              onChange={(e) => setTextInputValue(e.target.value)}
              onBlur={handleTextInputCommit} 
              onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextInputCommit(); }
                  if (e.key === 'Escape') { e.preventDefault(); setIsTextInputVisible(false); setTextInputValue(''); }
              }}
              className="absolute z-10 bg-background border border-primary shadow-lg p-2 rounded-md text-sm"
              style={getTextInputStyle()}
              placeholder="Type text here..."
            />
          )}
        </main>
      </div>
        <div className="hidden md:block w-[300px] lg:w-[350px] border-l shrink-0">
             <HistorySidebar
                history={activeSheet ? activeSheet.drawingHistory.slice(0, activeSheet.historyIndex + 1) : []}
                onToggleVisibility={handleToggleHistoryVisibility}
                onDeleteItem={handleDeleteHistoryItem}
                onSelectItemForEditing={handleSelectHistoryItemForEditing}
                className="h-full"
            />
        </div>
    </div>
  );
}

    