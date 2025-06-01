
"use client";

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';

export type DrawingTool = 'freehand' | 'line' | 'rectangle' | 'circle' | 'triangle' | 'text' | 'eraser' | 'image';

interface Point {
  x: number;
  y: number;
}

export interface TextElementData {
  id: string;
  text: string;
  x: number; y: number; 
  fontFamily: string;
  fontSize: number; 
  textColor: string;
  textAlign: 'left' | 'center' | 'right';
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  measuredWidth: number; 
  measuredHeight: number; 
}

export interface ImageActionData {
  id: string;
  src: string; // Data URL
  x: number; 
  y: number; 
  width: number; 
  height: number; 
}

interface ShapeAction {
  type: Exclude<DrawingTool, 'text' | 'eraser' | 'image'>;
  strokeColor: string;
  strokeWidth: number; 
  points?: Point[]; 
  startPoint?: Point; 
  endPoint?: Point; 
  fillColor?: string; 
  isFilled?: boolean; 
}

interface TextAction {
    type: 'text';
    id: string; 
    data: TextElementData; 
}

interface EraserAction {
    type: 'eraser';
    size: number; 
    points: Point[]; 
}

interface ImageDrawingAction {
  type: 'image';
  id: string; 
  data: ImageActionData;
}

type DrawingAction = ShapeAction | TextAction | EraserAction | ImageDrawingAction;


export interface CanvasRendererHandle {
  clearCanvas: () => void;
  downloadDrawing: (filename: string) => void;
  undo: () => void;
  redo: () => void;
  getCanvasElement: () => HTMLCanvasElement | null;
  addTextElement: (data: TextElementData) => void;
  updateTextElement: (id: string, newData: TextElementData) => void;
  getTextElementIdAtPoint: (point: Point) => Promise<string | null>; 
  getTextElementById: (id: string) => Promise<TextElementData | null>;
  addImageElement: (data: ImageActionData) => void;
}

interface CanvasRendererProps {
  tool: DrawingTool;
  strokeColor: string;
  strokeWidth: number; 
  fillColor: string;
  isFillEnabled: boolean;
  currentEditingTextId?: string | null; 
  onTextDragEnd?: (id: string, x: number, y: number, textElement: TextElementData | null) => void; 
  onTextSelect?: (id: string) => void; 
  previewImage?: { src: string; x: number; y: number; width: number; height: number } | null;
}


const CanvasRenderer = forwardRef<CanvasRendererHandle, CanvasRendererProps>(
  ({ tool, strokeColor, strokeWidth, fillColor, isFillEnabled, currentEditingTextId, onTextDragEnd, onTextSelect, previewImage }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDrawing, setIsDrawing] = useState(false); 
    const [startPoint, setStartPoint] = useState<Point | null>(null); 
    const [currentPath, setCurrentPath] = useState<Point[]>([]); 
    
    const [drawingHistory, setDrawingHistory] = useState<DrawingAction[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const [canvasSnapshotForPreview, setCanvasSnapshotForPreview] = useState<ImageData | null>(null);

    const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
    const [dragStartOffset, setDragStartOffset] = useState<Point | null>(null); 
    const [currentDragPosition, setCurrentDragPosition] = useState<Point | null>(null); 

    const [mouseCanvasPosition, setMouseCanvasPosition] = useState<Point | null>(null); 
    const [isMouseOnCanvas, setIsMouseOnCanvas] = useState<boolean>(false);
    
    const imageElementsCache = useRef<Map<string, HTMLImageElement>>(new Map());


    const getCoordinates = useCallback((event: MouseEvent | TouchEvent | React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      let clientX, clientY;

      if ('clientX' in event && 'clientY' in event) { 
        clientX = event.clientX; clientY = event.clientY;
      } else if ('touches' in event && event.touches && event.touches.length > 0) { 
        clientX = event.touches[0].clientX; clientY = event.touches[0].clientY;
      } else if ('changedTouches' in event && event.changedTouches && event.changedTouches.length > 0) { 
        clientX = event.changedTouches[0].clientX; clientY = event.changedTouches[0].clientY;
      } else { return null; }
      
      if (clientX === undefined || clientY === undefined) return null;
      return { x: clientX - rect.left, y: clientY - rect.top };
    }, []);

    const drawTextElement = (ctx: CanvasRenderingContext2D, data: TextElementData, isSelected?: boolean) => {
        ctx.font = `${data.isBold ? 'bold ' : ''}${data.isItalic ? 'italic ' : ''}${data.fontSize}px ${data.fontFamily}`; 
        ctx.fillStyle = data.textColor;
        ctx.textAlign = data.textAlign;
        
        let textX = data.x;
        if (data.textAlign === 'center') textX = data.x; 
        else if (data.textAlign === 'right') textX = data.x;

        ctx.fillText(data.text, textX, data.y);

        if (data.isUnderline) {
            const metrics = ctx.measureText(data.text); 
            let underlineStartX = data.x;
            if (data.textAlign === 'left') underlineStartX = data.x;
            else if (data.textAlign === 'center') underlineStartX = data.x - metrics.width / 2;
            else underlineStartX = data.x - metrics.width;
            const baselineOffset = data.fontSize * 0.1; 
            ctx.fillRect(underlineStartX, data.y + baselineOffset + 2, metrics.width, Math.max(1, data.fontSize / 15)); 
        }
        
        if (isSelected) {
            ctx.strokeStyle = 'rgba(0, 123, 255, 0.7)';
            ctx.lineWidth = 1; 
            ctx.setLineDash([4 / (window.devicePixelRatio || 1), 2 / (window.devicePixelRatio || 1)]); 
            const padding = 5; 
            let boxX = data.x;
            if (data.textAlign === 'left') boxX = data.x - padding;
            else if (data.textAlign === 'center') boxX = data.x - data.measuredWidth / 2 - padding;
            else boxX = data.x - data.measuredWidth - padding;

            ctx.strokeRect(boxX, data.y - data.measuredHeight - padding, data.measuredWidth + padding * 2, data.measuredHeight + padding * 2 );
            ctx.setLineDash([]);
        }
    };
    
    const drawShapeAction = (ctx: CanvasRenderingContext2D, action: ShapeAction) => { 
      ctx.strokeStyle = action.strokeColor;
      ctx.lineWidth = action.strokeWidth; 
      ctx.fillStyle = action.fillColor || '#000000';
      ctx.globalCompositeOperation = 'source-over';

      switch (action.type) {
        case 'freehand':
          if (action.points && action.points.length > 1) {
            ctx.beginPath(); ctx.moveTo(action.points[0].x, action.points[0].y);
            for (let j = 1; j < action.points.length; j++) ctx.lineTo(action.points[j].x, action.points[j].y);
            ctx.stroke();
          }
          break;
        case 'line':
          if (action.startPoint && action.endPoint) {
            ctx.beginPath(); ctx.moveTo(action.startPoint.x, action.startPoint.y);
            ctx.lineTo(action.endPoint.x, action.endPoint.y); ctx.stroke();
          }
          break;
        case 'rectangle':
          if (action.startPoint && action.endPoint) {
            const rectX = Math.min(action.startPoint.x, action.endPoint.x);
            const rectY = Math.min(action.startPoint.y, action.endPoint.y);
            const rectWidth = Math.abs(action.startPoint.x - action.endPoint.x);
            const rectHeight = Math.abs(action.startPoint.y - action.endPoint.y);
            ctx.beginPath(); ctx.rect(rectX, rectY, rectWidth, rectHeight); 
            if (action.isFilled) ctx.fill();
            ctx.stroke();
          }
          break;
        case 'circle':
          if (action.startPoint && action.endPoint) {
            const radius = Math.sqrt(Math.pow(action.endPoint.x - action.startPoint.x, 2) + Math.pow(action.endPoint.y - action.startPoint.y, 2)); 
            ctx.beginPath(); ctx.arc(action.startPoint.x, action.startPoint.y, radius, 0, 2 * Math.PI);
            if (action.isFilled) ctx.fill();
            ctx.stroke();
          }
          break;
        case 'triangle':
           if (action.startPoint && action.endPoint) {
            ctx.beginPath(); ctx.moveTo(action.startPoint.x, action.startPoint.y); 
            ctx.lineTo(action.endPoint.x, action.endPoint.y); 
            ctx.lineTo(action.startPoint.x - (action.endPoint.x - action.startPoint.x), action.endPoint.y); 
            ctx.closePath();
            if (action.isFilled) ctx.fill();
            ctx.stroke();
          }
          break;
      }
    };

    const redrawCanvas = useCallback(() => {
      const ctx = contextRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;
      
      ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

      const latestTextElements = new Map<string, TextElementData>();
      const imagesToProcessInThisRedraw: Array<{action: ImageDrawingAction, attemptLoad: boolean}> = [];


      for (let i = 0; i <= historyIndex; i++) {
        const action = drawingHistory[i];
        ctx.globalCompositeOperation = 'source-over';

        if (action.type === 'text') {
            ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
            const metrics = ctx.measureText(action.data.text); 
            const updatedData = { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize }; 
            latestTextElements.set(action.id, updatedData);
        } else if (action.type === 'eraser') {
            const { points, size } = action; 
            for (const point of points) { 
                ctx.clearRect(point.x - size / 2, point.y - size / 2, size, size); 
            }
        } else if (action.type === 'image') {
            imagesToProcessInThisRedraw.push({action: action, attemptLoad: true});
        }
         else { 
            drawShapeAction(ctx, action as ShapeAction); 
        }
      }
      
      latestTextElements.forEach((textData, id) => {
          if (draggingTextId === id && currentDragPosition) { 
              drawTextElement(ctx, { ...textData, x: currentDragPosition.x, y: currentDragPosition.y }, currentEditingTextId === id);
          } else {
              drawTextElement(ctx, textData, currentEditingTextId === id);
          }
      });

      imagesToProcessInThisRedraw.forEach(({action, attemptLoad}) => {
          let img = imageElementsCache.current.get(action.data.src);
          if (img && img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, action.data.x, action.data.y, action.data.width, action.data.height);
          } else if (attemptLoad && (!img || (!img.complete && !img.dataset.loading))) {
              const newImg = new Image();
              newImg.dataset.loading = 'true';
              imageElementsCache.current.set(action.data.src, newImg);
              newImg.src = action.data.src;
              newImg.onload = () => {
                  delete newImg.dataset.loading;
                  requestAnimationFrame(redrawCanvas); 
              };
              newImg.onerror = () => {
                  console.error("Error loading image for drawing:", action.data.src);
                  imageElementsCache.current.delete(action.data.src);
                  delete newImg.dataset.loading;
              };
          }
      });


      if (tool === 'eraser' && !isDrawing && isMouseOnCanvas && mouseCanvasPosition && ctx) { 
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = 'rgba(100, 100, 100, 0.7)'; 
          ctx.lineWidth = 1; 
          const previewSize = strokeWidth; 
          ctx.strokeRect(mouseCanvasPosition.x - previewSize / 2, mouseCanvasPosition.y - previewSize / 2, previewSize, previewSize); 
          ctx.restore();
      }

      if (previewImage && previewImage.src) {
        let pImg = imageElementsCache.current.get(previewImage.src);
        if (pImg && pImg.complete && pImg.naturalWidth > 0) {
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.drawImage(pImg, previewImage.x, previewImage.y, previewImage.width, previewImage.height);
            ctx.restore();
        } else if (!pImg || (!pImg.complete && !pImg.dataset.loading)) {
            const newPImg = new Image();
            newPImg.dataset.loading = 'true';
            imageElementsCache.current.set(previewImage.src, newPImg);
            newPImg.src = previewImage.src;
            newPImg.onload = () => {
                delete newPImg.dataset.loading;
                requestAnimationFrame(redrawCanvas); 
            };
            newPImg.onerror = () => {
                 console.error("Error loading preview image:", previewImage?.src);
                 if(previewImage?.src) imageElementsCache.current.delete(previewImage.src);
                 delete newPImg.dataset.loading;
            };
        }
    }

    }, [drawingHistory, historyIndex, currentEditingTextId, draggingTextId, currentDragPosition, tool, isDrawing, isMouseOnCanvas, mouseCanvasPosition, strokeWidth, previewImage]);


    const initializeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !containerRef.current) return;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = containerRef.current.getBoundingClientRect(); 
      
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      context.scale(dpr, dpr); 
      
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.textBaseline = 'alphabetic'; 
      contextRef.current = context;
      redrawCanvas();
    }, [redrawCanvas]);

    useEffect(() => {
      initializeCanvas();
      const resizeTarget = containerRef.current;
      if (!resizeTarget) return;
      const obs = new ResizeObserver(initializeCanvas);
      obs.observe(resizeTarget);
      return () => obs.unobserve(resizeTarget);
    }, [initializeCanvas]);

    useEffect(() => { 
        if ((tool === 'eraser' && !isDrawing) || (tool === 'image' && previewImage)) {
            requestAnimationFrame(redrawCanvas);
        }
    }, [mouseCanvasPosition, isMouseOnCanvas, tool, isDrawing, redrawCanvas, previewImage]);

    const getTextElementAtPointInternal = useCallback((point: Point): TextElementData | null => { 
        const ctx = contextRef.current;
        if (!ctx) return null;
        const latestTextElements = new Map<string, TextElementData>();
        for (let i = historyIndex; i >= 0; i--) {
            const action = drawingHistory[i];
            if (action.type === 'text' && !latestTextElements.has(action.id)) {
                ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`; 
                const metrics = ctx.measureText(action.data.text); 
                latestTextElements.set(action.id, { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize }); 
            }
        }
        
        for (const textData of Array.from(latestTextElements.values()).reverse()) { 
            let x1 = textData.x;
            if (textData.textAlign === 'left') x1 = textData.x;
            else if (textData.textAlign === 'center') x1 = textData.x - textData.measuredWidth / 2;
            else x1 = textData.x - textData.measuredWidth;
            
            const y1 = textData.y - textData.measuredHeight; 
            const x2 = x1 + textData.measuredWidth;
            const y2 = textData.y; 

            if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) {
                return textData;
            }
        }
        return null;
    }, [drawingHistory, historyIndex]);


    const startDrawingInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (tool === 'image') return; // Image placement is handled by parent click
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();
      const nativeEvent = event.nativeEvent;
      const coords = getCoordinates(nativeEvent); 
      if (!coords || !contextRef.current) return;

      if (tool === 'text') {
        const clickedText = getTextElementAtPointInternal(coords); 
        if (clickedText) { 
            setDraggingTextId(clickedText.id);
            const offsetX = coords.x - clickedText.x; 
            const offsetY = coords.y - clickedText.y; 
            setDragStartOffset({ x: offsetX, y: offsetY });
            setCurrentDragPosition({x: clickedText.x, y: clickedText.y}); 
             if(onTextSelect) onTextSelect(clickedText.id);
        } else {
             setDraggingTextId(null); 
        }
        return; 
      }

      setIsDrawing(true);
      setStartPoint(coords); 
      if (tool === 'freehand' || tool === 'eraser') {
        setCurrentPath([coords]); 
        if (tool === 'eraser') {
            const eraserSize = strokeWidth; 
            contextRef.current.clearRect(coords.x - eraserSize / 2, coords.y - eraserSize / 2, eraserSize, eraserSize); 
        }
      } else { 
        const dpr = window.devicePixelRatio || 1;
        setCanvasSnapshotForPreview(contextRef.current.getImageData(0, 0, contextRef.current.canvas.width / dpr, contextRef.current.canvas.height / dpr));
      }
    }, [getCoordinates, tool, getTextElementAtPointInternal, onTextSelect, strokeWidth]);

    const drawInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (tool === 'image') return;
      const ctx = contextRef.current;
      if (!ctx || (!startPoint && !draggingTextId)) return;
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();
      const currentCoords = getCoordinates(event.nativeEvent); 
      if (!currentCoords) return;

      if (draggingTextId && dragStartOffset) { 
        const newX = currentCoords.x - dragStartOffset.x;
        const newY = currentCoords.y - dragStartOffset.y;
        setCurrentDragPosition({x: newX, y: newY}); 
        requestAnimationFrame(redrawCanvas); 
        return;
      }
      
      if (!isDrawing || tool === 'text' || !startPoint) return; 

      if (tool === 'eraser') {
          setCurrentPath(prevPath => [...prevPath, currentCoords]); 
          const eraserSize = strokeWidth; 
          ctx.clearRect(currentCoords.x - eraserSize / 2, currentCoords.y - eraserSize / 2, eraserSize, eraserSize); 
          return;
      }
      
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth; 
      ctx.fillStyle = fillColor;
      ctx.globalCompositeOperation = 'source-over';

      if (tool === 'freehand') {
        const prevCurrentPath = currentPathRef.current; 
        setCurrentPath(prevPath => [...prevPath, currentCoords]); 
        currentPathRef.current = [...prevCurrentPath, currentCoords];

        ctx.beginPath();
        if (prevCurrentPath.length > 0) {
             ctx.moveTo(prevCurrentPath[prevCurrentPath.length-1].x, prevCurrentPath[prevCurrentPath.length-1].y);
        } else if (startPoint) { 
            ctx.moveTo(startPoint.x, startPoint.y);
        }
        ctx.lineTo(currentCoords.x, currentCoords.y); 
        ctx.stroke();
      } else { 
        if (canvasSnapshotForPreview) ctx.putImageData(canvasSnapshotForPreview, 0, 0); 
        else redrawCanvas(); 
        
        const tempAction: ShapeAction = { type: tool as Exclude<DrawingTool, 'text' | 'eraser' | 'image'>, strokeColor, strokeWidth, fillColor, isFilled: isFillEnabled, startPoint, endPoint: currentCoords };
        drawShapeAction(ctx, tempAction); 
      }
    }, [isDrawing, startPoint, getCoordinates, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, canvasSnapshotForPreview, redrawCanvas, draggingTextId, dragStartOffset]);
    
    const currentPathRef = useRef<Point[]>([]);
    useEffect(() => {
        currentPathRef.current = currentPath;
    }, [currentPath]);


    const handleMouseUpTouchEnd = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (tool === 'image') return;
        if (draggingTextId && currentDragPosition && onTextDragEnd) { 
            const textElement = drawingHistory.slice(0, historyIndex + 1).reverse()
                .find(act => act.type === 'text' && act.id === draggingTextId) as TextAction | undefined;
            if (textElement) { 
                 onTextDragEnd(draggingTextId, currentDragPosition.x, currentDragPosition.y, textElement.data);
            }
            setDraggingTextId(null); setDragStartOffset(null); setCurrentDragPosition(null);
            requestAnimationFrame(redrawCanvas); 
            return;
        }

        if (!isDrawing || !contextRef.current || !startPoint || tool === 'text') {
            if(isDrawing) setIsDrawing(false);
            return;
        }

        const nativeEvent = event.nativeEvent;
        const finalCoords = getCoordinates(nativeEvent); 
        let newAction: DrawingAction | null = null;
        const pathForAction = [...currentPathRef.current, ...(finalCoords && currentPathRef.current.length > 0 && currentPathRef.current[currentPathRef.current.length-1].x !== finalCoords.x && currentPathRef.current[currentPathRef.current.length-1].y !== finalCoords.y ? [finalCoords] : finalCoords && currentPathRef.current.length === 0 ? [finalCoords] : [])];


        if (tool === 'freehand') {
            if (pathForAction.length > 0) {
                 newAction = { type: 'freehand', points: pathForAction, strokeColor, strokeWidth };
            }
        } else if (tool === 'eraser') {
            if (pathForAction.length > 0) {
                newAction = { type: 'eraser', points: pathForAction, size: strokeWidth }; 
            }
        } else if (finalCoords && tool !== 'image') { 
            newAction = { type: tool as Exclude<DrawingTool, 'text' | 'eraser' | 'freehand' | 'image'>, startPoint, endPoint: finalCoords, strokeColor, strokeWidth, fillColor: (tool !== 'line') ? fillColor : undefined, isFilled: (tool !== 'line') ? isFillEnabled : undefined };
        } else if (pathForAction.length > 0 && tool !== 'freehand' && tool !== 'eraser' && tool !== 'image') { 
             newAction = { type: tool as Exclude<DrawingTool, 'text' | 'eraser' | 'freehand' | 'image'>, startPoint, endPoint: pathForAction[pathForAction.length -1] || startPoint, strokeColor, strokeWidth, fillColor: (tool !== 'line') ? fillColor : undefined, isFilled: (tool !== 'line') ? isFillEnabled : undefined};
        }


        if (newAction) {
            const newHistory = drawingHistory.slice(0, historyIndex + 1);
            setDrawingHistory([...newHistory, newAction]);
            setHistoryIndex(newHistory.length);
        }
        
        setIsDrawing(false); setStartPoint(null); setCurrentPath([]); currentPathRef.current = []; setCanvasSnapshotForPreview(null);
        if (newAction) requestAnimationFrame(redrawCanvas);
    }, [isDrawing, startPoint, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, drawingHistory, historyIndex, redrawCanvas, getCoordinates, draggingTextId, currentDragPosition, onTextDragEnd]);

    useImperativeHandle(ref, () => ({
      clearCanvas: () => {
        if (contextRef.current && canvasRef.current) {
          const dpr = window.devicePixelRatio || 1;
          contextRef.current.clearRect(0, 0, canvasRef.current.width / dpr, canvasRef.current.height / dpr);
          setDrawingHistory([]);
          setHistoryIndex(-1);
          imageElementsCache.current.clear(); // Clear image cache as well
        }
      },
      downloadDrawing: (filename: string) => {
        if (canvasRef.current && contextRef.current) {
            const canvas = canvasRef.current; 
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width; 
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.fillStyle = '#FFFFFF'; 
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height); 
                tempCtx.drawImage(canvas, 0, 0); 
                const dataURL = tempCanvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = dataURL; link.download = filename;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
            }
        }
      },
      undo: () => {
        if (historyIndex >= 0) {
          setHistoryIndex(prevIndex => prevIndex - 1);
          requestAnimationFrame(redrawCanvas);
        }
      },
      redo: () => {
        if (historyIndex < drawingHistory.length - 1) {
          setHistoryIndex(prevIndex => prevIndex + 1);
          requestAnimationFrame(redrawCanvas);
        }
      },
      getCanvasElement: () => canvasRef.current,
      addTextElement: (data: TextElementData) => { 
        const newHistory = drawingHistory.slice(0, historyIndex + 1);
        const ctx = contextRef.current; let finalData = data;
        if(ctx){ 
            ctx.font = `${data.isBold ? 'bold ' : ''}${data.isItalic ? 'italic ' : ''}${data.fontSize}px ${data.fontFamily}`;
            const metrics = ctx.measureText(data.text);
            finalData = { ...data, measuredWidth: metrics.width, measuredHeight: data.fontSize };
        }
        setDrawingHistory([...newHistory, { type: 'text', id: finalData.id, data: finalData }]);
        setHistoryIndex(newHistory.length);
        requestAnimationFrame(redrawCanvas);
      },
      updateTextElement: (id: string, newData: TextElementData) => { 
        const newHistory = drawingHistory.slice(0, historyIndex + 1);
         const ctx = contextRef.current; let finalData = newData;
        if(ctx){ 
            ctx.font = `${newData.isBold ? 'bold ' : ''}${newData.isItalic ? 'italic ' : ''}${newData.fontSize}px ${newData.fontFamily}`;
            const metrics = ctx.measureText(newData.text);
            finalData = { ...newData, measuredWidth: metrics.width, measuredHeight: newData.fontSize };
        }
        setDrawingHistory([...newHistory, { type: 'text', id: id, data: finalData }]);
        setHistoryIndex(newHistory.length);
        requestAnimationFrame(redrawCanvas);
      },
      getTextElementIdAtPoint: async (point: Point): Promise<string | null> => getTextElementAtPointInternal(point)?.id || null, 
      getTextElementById: async (id: string): Promise<TextElementData | null> => {
        for (let i = historyIndex; i >= 0; i--) {
            const action = drawingHistory[i];
            if (action.type === 'text' && action.id === id) {
                const ctx = contextRef.current;
                if(ctx) { 
                    ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
                    const metrics = ctx.measureText(action.data.text);
                    return { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize };
                }
                return action.data; 
            }
        }
        return null;
      },
      addImageElement: (data: ImageActionData) => {
        const newHistory = drawingHistory.slice(0, historyIndex + 1);
        // Ensure image is preloaded or handled by cache in redrawCanvas
        const newAction: ImageDrawingAction = { type: 'image', id: data.id, data };
        setDrawingHistory([...newHistory, newAction]);
        setHistoryIndex(newHistory.length);
        
        // Preload image into cache if not already there
        if (!imageElementsCache.current.has(data.src)) {
            const img = new Image();
            img.dataset.loading = 'true';
            imageElementsCache.current.set(data.src, img);
            img.src = data.src;
            img.onload = () => {
                delete img.dataset.loading;
                requestAnimationFrame(redrawCanvas); // Image loaded, trigger redraw
            };
            img.onerror = () => {
                console.error("Error preloading image:", data.src);
                imageElementsCache.current.delete(data.src);
                delete img.dataset.loading;
            };
        } else {
             requestAnimationFrame(redrawCanvas); // Already cached or loading, just redraw
        }
      },
    }));

    const handleContainerMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const localCoords = getCoordinates(event);
        if (tool === 'eraser' && !isDrawing) {
            setMouseCanvasPosition(localCoords);
        }
    }, [tool, isDrawing, getCoordinates]);

    const handleContainerMouseEnter = useCallback(() => {
        if (tool === 'eraser' && !isDrawing) {
            setIsMouseOnCanvas(true);
        }
    }, [tool, isDrawing]);
    
    const handleContainerMouseLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (tool === 'eraser' && !isDrawing) {
            setIsMouseOnCanvas(false);
            setMouseCanvasPosition(null); 
            requestAnimationFrame(redrawCanvas); 
        }
        if (isDrawing && (tool !== 'text' && tool !== 'eraser' && tool !== 'image')) { 
             if (canvasRef.current && event.target === canvasRef.current) {
                 handleMouseUpTouchEnd(event as unknown as React.MouseEvent<HTMLCanvasElement>);
             }
        }
    }, [tool, isDrawing, handleMouseUpTouchEnd, redrawCanvas]);


    return (
      <div 
        ref={containerRef} 
        className="w-full h-full touch-none"
        onMouseMove={handleContainerMouseMove}
        onMouseEnter={handleContainerMouseEnter}
        onMouseLeave={handleContainerMouseLeave}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawingInternal}
          onMouseMove={drawInternal}
  	      onMouseUp={handleMouseUpTouchEnd}
          onTouchStart={startDrawingInternal}
          onTouchMove={drawInternal}
  	      onTouchEnd={handleMouseUpTouchEnd}
          className="w-full h-full cursor-crosshair"
          data-ai-hint="drawing abstract background"
        />
      </div>
    );
  }
);

CanvasRenderer.displayName = 'CanvasRenderer';
export default CanvasRenderer;
