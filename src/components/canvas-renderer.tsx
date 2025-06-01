
"use client";

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';

export type DrawingTool = 'freehand' | 'line' | 'rectangle' | 'circle' | 'triangle' | 'text' | 'eraser';

interface Point {
  x: number;
  y: number;
}

export interface TextElementData {
  id: string;
  text: string;
  x: number; y: number; // Logical canvas coordinates
  fontFamily: string;
  fontSize: number; // Logical font size
  textColor: string;
  textAlign: 'left' | 'center' | 'right';
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  measuredWidth: number; // Logical width
  measuredHeight: number; // Logical height (based on fontSize)
}

interface ShapeAction {
  type: Exclude<DrawingTool, 'text' | 'eraser'>;
  strokeColor: string;
  strokeWidth: number; // Logical stroke width
  points?: Point[]; // Logical points
  startPoint?: Point; // Logical point
  endPoint?: Point; // Logical point
  fillColor?: string; 
  isFilled?: boolean; 
}

interface TextAction {
    type: 'text';
    id: string; 
    data: TextElementData; // Contains logical coordinates and sizes
}

interface EraserAction {
    type: 'eraser';
    size: number; // Logical eraser size
    points: Point[]; // Logical points
}

type DrawingAction = ShapeAction | TextAction | EraserAction;


export interface CanvasRendererHandle {
  clearCanvas: () => void;
  downloadDrawing: (filename: string) => void;
  undo: () => void;
  redo: () => void;
  getCanvasElement: () => HTMLCanvasElement | null;
  addTextElement: (data: TextElementData) => void;
  updateTextElement: (id: string, newData: TextElementData) => void;
  getTextElementIdAtPoint: (point: Point) => Promise<string | null>; // Point is logical
  getTextElementById: (id: string) => Promise<TextElementData | null>;
}

interface CanvasRendererProps {
  tool: DrawingTool;
  strokeColor: string;
  strokeWidth: number; // Logical stroke/eraser size
  fillColor: string;
  isFillEnabled: boolean;
  currentEditingTextId?: string | null; 
  onTextDragEnd?: (id: string, x: number, y: number, textElement: TextElementData | null) => void; // x, y are logical
  onTextSelect?: (id: string) => void; 
}


const CanvasRenderer = forwardRef<CanvasRendererHandle, CanvasRendererProps>(
  ({ tool, strokeColor, strokeWidth, fillColor, isFillEnabled, currentEditingTextId, onTextDragEnd, onTextSelect }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDrawing, setIsDrawing] = useState(false); 
    const [startPoint, setStartPoint] = useState<Point | null>(null); // Logical point
    const [currentPath, setCurrentPath] = useState<Point[]>([]); // Array of logical points
    
    const [drawingHistory, setDrawingHistory] = useState<DrawingAction[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const [canvasSnapshotForPreview, setCanvasSnapshotForPreview] = useState<ImageData | null>(null);

    const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
    const [dragStartOffset, setDragStartOffset] = useState<Point | null>(null); // Logical offset
    const [currentDragPosition, setCurrentDragPosition] = useState<Point | null>(null); // Logical position

    const [mouseCanvasPosition, setMouseCanvasPosition] = useState<Point | null>(null); // Logical position for eraser preview
    const [isMouseOnCanvas, setIsMouseOnCanvas] = useState<boolean>(false);


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
      // Return logical coordinates (CSS pixels relative to canvas)
      return { x: clientX - rect.left, y: clientY - rect.top };
    }, []);

    const drawTextElement = (ctx: CanvasRenderingContext2D, data: TextElementData, isSelected?: boolean) => {
        ctx.font = `${data.isBold ? 'bold ' : ''}${data.isItalic ? 'italic ' : ''}${data.fontSize}px ${data.fontFamily}`; // fontSize is logical
        ctx.fillStyle = data.textColor;
        ctx.textAlign = data.textAlign;
        
        // data.x, data.y are logical
        let textX = data.x;
        if (data.textAlign === 'center') textX = data.x; // textAlign handles this for fillText
        else if (data.textAlign === 'right') textX = data.x;

        ctx.fillText(data.text, textX, data.y);

        if (data.isUnderline) {
            const metrics = ctx.measureText(data.text); // metrics.width is logical
            let underlineStartX = data.x;
            if (data.textAlign === 'left') underlineStartX = data.x;
            else if (data.textAlign === 'center') underlineStartX = data.x - metrics.width / 2;
            else underlineStartX = data.x - metrics.width;
            const baselineOffset = data.fontSize * 0.1; // logical
            ctx.fillRect(underlineStartX, data.y + baselineOffset + 2, metrics.width, Math.max(1, data.fontSize / 15)); // underline thickness is logical
        }
        
        if (isSelected) {
            ctx.strokeStyle = 'rgba(0, 123, 255, 0.7)';
            ctx.lineWidth = 1; // Logical lineWidth for selection box
            ctx.setLineDash([4 / (window.devicePixelRatio || 1), 2 / (window.devicePixelRatio || 1)]); // Adjust dash for visual consistency if needed, or keep logical
            const padding = 5; // Logical padding
            let boxX = data.x;
            // data.measuredWidth and data.measuredHeight are logical
            if (data.textAlign === 'left') boxX = data.x - padding;
            else if (data.textAlign === 'center') boxX = data.x - data.measuredWidth / 2 - padding;
            else boxX = data.x - data.measuredWidth - padding;

            ctx.strokeRect(boxX, data.y - data.measuredHeight - padding, data.measuredWidth + padding * 2, data.measuredHeight + padding * 2 );
            ctx.setLineDash([]);
        }
    };
    
    const drawShapeAction = (ctx: CanvasRenderingContext2D, action: ShapeAction) => { 
      ctx.strokeStyle = action.strokeColor;
      ctx.lineWidth = action.strokeWidth; // Logical width
      ctx.fillStyle = action.fillColor || '#000000';
      ctx.globalCompositeOperation = 'source-over';

      // All points (action.points, action.startPoint, action.endPoint) are logical
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
            ctx.beginPath(); ctx.rect(rectX, rectY, rectWidth, rectHeight); // Logical dimensions
            if (action.isFilled) ctx.fill();
            ctx.stroke();
          }
          break;
        case 'circle':
          if (action.startPoint && action.endPoint) {
            const radius = Math.sqrt(Math.pow(action.endPoint.x - action.startPoint.x, 2) + Math.pow(action.endPoint.y - action.startPoint.y, 2)); // Logical radius
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
      
      // Clear using logical dimensions, context.scale handles the rest
      ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

      const latestTextElements = new Map<string, TextElementData>();

      for (let i = 0; i <= historyIndex; i++) {
        const action = drawingHistory[i];
        ctx.globalCompositeOperation = 'source-over';

        if (action.type === 'text') {
            // Ensure measuredWidth/Height are logical, based on logical fontSize
            ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
            const metrics = ctx.measureText(action.data.text); // metrics.width is logical
            const updatedData = { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize }; // fontSize is logical height approximation
            latestTextElements.set(action.id, updatedData);
        } else if (action.type === 'eraser') {
            const { points, size } = action; // size is logical
            for (const point of points) { // points are logical
                ctx.clearRect(point.x - size / 2, point.y - size / 2, size, size); // clearRect uses logical coords/size
            }
        } else { 
            drawShapeAction(ctx, action as ShapeAction); // Uses logical coords/sizes
        }
      }
      
      latestTextElements.forEach((textData, id) => {
          if (draggingTextId === id && currentDragPosition) { // currentDragPosition is logical
              drawTextElement(ctx, { ...textData, x: currentDragPosition.x, y: currentDragPosition.y }, currentEditingTextId === id);
          } else {
              drawTextElement(ctx, textData, currentEditingTextId === id);
          }
      });

      if (tool === 'eraser' && !isDrawing && isMouseOnCanvas && mouseCanvasPosition && ctx) { // mouseCanvasPosition is logical
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = 'rgba(100, 100, 100, 0.7)'; 
          ctx.lineWidth = 1; // Logical line width for preview
          const previewSize = strokeWidth; // strokeWidth is logical eraser size
          ctx.strokeRect(mouseCanvasPosition.x - previewSize / 2, mouseCanvasPosition.y - previewSize / 2, previewSize, previewSize); // logical coords/size
          ctx.restore();
      }

    }, [drawingHistory, historyIndex, currentEditingTextId, draggingTextId, currentDragPosition, tool, isDrawing, isMouseOnCanvas, mouseCanvasPosition, strokeWidth]);


    const initializeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !containerRef.current) return;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = containerRef.current.getBoundingClientRect(); // Physical dimensions of container
      
      // Set canvas backing store size (physical pixels)
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      
      // Set display size (CSS pixels)
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      context.scale(dpr, dpr); // Scale context to work with logical coordinates
      
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
        if (tool === 'eraser' && !isDrawing) {
            redrawCanvas();
        }
    }, [mouseCanvasPosition, isMouseOnCanvas, tool, isDrawing, redrawCanvas]);

    const getTextElementAtPointInternal = useCallback((point: Point): TextElementData | null => { // point is logical
        const ctx = contextRef.current;
        if (!ctx) return null;
        const latestTextElements = new Map<string, TextElementData>();
        for (let i = historyIndex; i >= 0; i--) {
            const action = drawingHistory[i];
            if (action.type === 'text' && !latestTextElements.has(action.id)) {
                ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`; // fontSize is logical
                const metrics = ctx.measureText(action.data.text); // metrics.width is logical
                latestTextElements.set(action.id, { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize }); // fontSize for logical height
            }
        }
        
        for (const textData of Array.from(latestTextElements.values()).reverse()) { 
            // All textData dimensions (x, y, measuredWidth, measuredHeight) are logical
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
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();
      const nativeEvent = event.nativeEvent;
      const coords = getCoordinates(nativeEvent); // coords are logical
      if (!coords || !contextRef.current) return;

      if (tool === 'text') {
        const clickedText = getTextElementAtPointInternal(coords); // coords is logical
        if (clickedText) { // clickedText has logical coords
            setDraggingTextId(clickedText.id);
            const offsetX = coords.x - clickedText.x; // logical offset
            const offsetY = coords.y - clickedText.y; // logical offset
            setDragStartOffset({ x: offsetX, y: offsetY });
            setCurrentDragPosition({x: clickedText.x, y: clickedText.y}); // logical position
             if(onTextSelect) onTextSelect(clickedText.id);
        } else {
             setDraggingTextId(null); 
        }
        return; 
      }

      setIsDrawing(true);
      setStartPoint(coords); // coords is logical
      if (tool === 'freehand' || tool === 'eraser') {
        setCurrentPath([coords]); // Store logical coords
        if (tool === 'eraser') {
            const eraserSize = strokeWidth; // logical size
            contextRef.current.clearRect(coords.x - eraserSize / 2, coords.y - eraserSize / 2, eraserSize, eraserSize); // Use logical coords and size
        }
      } else { 
        const dpr = window.devicePixelRatio || 1;
        // getImageData expects physical pixel coords if context not scaled, but here context IS scaled.
        // So, specify logical dimensions for getImageData.
        setCanvasSnapshotForPreview(contextRef.current.getImageData(0, 0, contextRef.current.canvas.width / dpr, contextRef.current.canvas.height / dpr));
      }
    }, [getCoordinates, tool, getTextElementAtPointInternal, onTextSelect, strokeWidth]);

    const drawInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const ctx = contextRef.current;
      if (!ctx || (!startPoint && !draggingTextId)) return;
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();
      const currentCoords = getCoordinates(event.nativeEvent); // currentCoords are logical
      if (!currentCoords) return;

      if (draggingTextId && dragStartOffset) { // dragStartOffset and currentCoords are logical
        const newX = currentCoords.x - dragStartOffset.x;
        const newY = currentCoords.y - dragStartOffset.y;
        setCurrentDragPosition({x: newX, y: newY}); // Store logical position
        requestAnimationFrame(redrawCanvas); 
        return;
      }
      
      if (!isDrawing || tool === 'text' || !startPoint) return; 

      if (tool === 'eraser') {
          setCurrentPath(prevPath => [...prevPath, currentCoords]); // Store logical coords
          const eraserSize = strokeWidth; // logical size
          ctx.clearRect(currentCoords.x - eraserSize / 2, currentCoords.y - eraserSize / 2, eraserSize, eraserSize); // Use logical coords and size
          return;
      }
      
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth; // logical width
      ctx.fillStyle = fillColor;
      ctx.globalCompositeOperation = 'source-over';

      if (tool === 'freehand') {
        const prevCurrentPath = currentPathRef.current; // Array of logical points
        setCurrentPath(prevPath => [...prevPath, currentCoords]); // Store logical coords
        currentPathRef.current = [...prevCurrentPath, currentCoords];

        ctx.beginPath();
        if (prevCurrentPath.length > 0) {
             ctx.moveTo(prevCurrentPath[prevCurrentPath.length-1].x, prevCurrentPath[prevCurrentPath.length-1].y);
        } else if (startPoint) { // startPoint is logical
            ctx.moveTo(startPoint.x, startPoint.y);
        }
        ctx.lineTo(currentCoords.x, currentCoords.y); // currentCoords is logical
        ctx.stroke();
      } else { 
        if (canvasSnapshotForPreview) ctx.putImageData(canvasSnapshotForPreview, 0, 0); // putImageData expects physical data, but draws onto scaled context
        else redrawCanvas(); 
        
        // startPoint and currentCoords are logical
        const tempAction: ShapeAction = { type: tool as Exclude<DrawingTool, 'text' | 'eraser'>, strokeColor, strokeWidth, fillColor, isFilled: isFillEnabled, startPoint, endPoint: currentCoords };
        drawShapeAction(ctx, tempAction); // drawShapeAction uses logical coords
      }
    }, [isDrawing, startPoint, getCoordinates, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, canvasSnapshotForPreview, redrawCanvas, draggingTextId, dragStartOffset]);
    
    const currentPathRef = useRef<Point[]>([]);
    useEffect(() => {
        currentPathRef.current = currentPath;
    }, [currentPath]);


    const handleMouseUpTouchEnd = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (draggingTextId && currentDragPosition && onTextDragEnd) { // currentDragPosition is logical
            const textElement = drawingHistory.slice(0, historyIndex + 1).reverse()
                .find(act => act.type === 'text' && act.id === draggingTextId) as TextAction | undefined;
            if (textElement) { // textElement.data contains logical x,y
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
        const finalCoords = getCoordinates(nativeEvent); // finalCoords are logical
        let newAction: DrawingAction | null = null;
        // pathForAction contains logical points
        const pathForAction = [...currentPathRef.current, ...(finalCoords && currentPathRef.current.length > 0 && currentPathRef.current[currentPathRef.current.length-1].x !== finalCoords.x && currentPathRef.current[currentPathRef.current.length-1].y !== finalCoords.y ? [finalCoords] : finalCoords && currentPathRef.current.length === 0 ? [finalCoords] : [])];


        if (tool === 'freehand') {
            if (pathForAction.length > 0) {
                 newAction = { type: 'freehand', points: pathForAction, strokeColor, strokeWidth };
            }
        } else if (tool === 'eraser') {
            if (pathForAction.length > 0) {
                newAction = { type: 'eraser', points: pathForAction, size: strokeWidth }; // strokeWidth is logical size
            }
        } else if (finalCoords) { // Shapes, startPoint and finalCoords are logical
            newAction = { type: tool as Exclude<DrawingTool, 'text' | 'eraser' | 'freehand'>, startPoint, endPoint: finalCoords, strokeColor, strokeWidth, fillColor: (tool !== 'line') ? fillColor : undefined, isFilled: (tool !== 'line') ? isFillEnabled : undefined };
        } else if (pathForAction.length > 0 && tool !== 'freehand' && tool !== 'eraser') { 
             newAction = { type: tool as Exclude<DrawingTool, 'text' | 'eraser' | 'freehand'>, startPoint, endPoint: pathForAction[pathForAction.length -1] || startPoint, strokeColor, strokeWidth, fillColor: (tool !== 'line') ? fillColor : undefined, isFilled: (tool !== 'line') ? isFillEnabled : undefined};
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
          // Clear using logical dimensions
          contextRef.current.clearRect(0, 0, canvasRef.current.width / dpr, canvasRef.current.height / dpr);
          setDrawingHistory([]);
          setHistoryIndex(-1);
        }
      },
      downloadDrawing: (filename: string) => {
        if (canvasRef.current && contextRef.current) {
            const canvas = canvasRef.current; // This is the high-res canvas
            const tempCanvas = document.createElement('canvas');
            // tempCanvas should match physical dimensions of the source canvas
            tempCanvas.width = canvas.width; 
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.fillStyle = '#FFFFFF'; // Draw white background on temp canvas
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height); // Fill physical dimensions
                tempCtx.drawImage(canvas, 0, 0); // Draw source (high-res) canvas onto temp (high-res) canvas
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
      addTextElement: (data: TextElementData) => { // data contains logical coords/sizes
        const newHistory = drawingHistory.slice(0, historyIndex + 1);
        const ctx = contextRef.current; let finalData = data;
        if(ctx){ // Calculate logical measuredWidth/Height
            ctx.font = `${data.isBold ? 'bold ' : ''}${data.isItalic ? 'italic ' : ''}${data.fontSize}px ${data.fontFamily}`;
            const metrics = ctx.measureText(data.text);
            finalData = { ...data, measuredWidth: metrics.width, measuredHeight: data.fontSize };
        }
        setDrawingHistory([...newHistory, { type: 'text', id: finalData.id, data: finalData }]);
        setHistoryIndex(newHistory.length);
        requestAnimationFrame(redrawCanvas);
      },
      updateTextElement: (id: string, newData: TextElementData) => { // newData contains logical coords/sizes
        const newHistory = drawingHistory.slice(0, historyIndex + 1);
         const ctx = contextRef.current; let finalData = newData;
        if(ctx){ // Calculate logical measuredWidth/Height
            ctx.font = `${newData.isBold ? 'bold ' : ''}${newData.isItalic ? 'italic ' : ''}${newData.fontSize}px ${newData.fontFamily}`;
            const metrics = ctx.measureText(newData.text);
            finalData = { ...newData, measuredWidth: metrics.width, measuredHeight: newData.fontSize };
        }
        setDrawingHistory([...newHistory, { type: 'text', id: id, data: finalData }]);
        setHistoryIndex(newHistory.length);
        requestAnimationFrame(redrawCanvas);
      },
      getTextElementIdAtPoint: async (point: Point): Promise<string | null> => getTextElementAtPointInternal(point)?.id || null, // point is logical
      getTextElementById: async (id: string): Promise<TextElementData | null> => {
        for (let i = historyIndex; i >= 0; i--) {
            const action = drawingHistory[i];
            if (action.type === 'text' && action.id === id) {
                const ctx = contextRef.current;
                if(ctx) { // Ensure logical measuredWidth/Height are part of the returned data
                    ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
                    const metrics = ctx.measureText(action.data.text);
                    return { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize };
                }
                return action.data; // Fallback, though should have context
            }
        }
        return null;
      },
    }));

    const handleContainerMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (tool === 'eraser' && !isDrawing) {
            const coords = getCoordinates(event); // coords are logical
            setMouseCanvasPosition(coords);
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
            requestAnimationFrame(redrawCanvas); // Ensure preview is cleared
        }
        if (isDrawing && (tool !== 'text' && tool !== 'eraser')) { 
            // If drawing a shape and mouse leaves canvas, treat as mouseup
            // Need to simulate a mouseup event or call the handler directly
            // For simplicity, just call handleMouseUpTouchEnd
            // We might need to check if event is a React.MouseEvent<HTMLCanvasElement>
             if (canvasRef.current && event.target === canvasRef.current) {
                 handleMouseUpTouchEnd(event as unknown as React.MouseEvent<HTMLCanvasElement>);
             } else {
                // If mouse leaves container but not canvas, might not need to stop drawing.
                // However, for robust behavior, if it leaves the main container, ending drawing is safer.
                // This part can be tricky; a simple approach is to end if drawing.
                // const mockEvent = { nativeEvent: event.nativeEvent } as React.MouseEvent<HTMLCanvasElement>;
                // handleMouseUpTouchEnd(mockEvent); 
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
          data-ai-hint="drawing abstract"
        />
      </div>
    );
  }
);

CanvasRenderer.displayName = 'CanvasRenderer';
export default CanvasRenderer;
