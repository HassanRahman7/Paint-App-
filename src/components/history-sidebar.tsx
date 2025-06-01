
"use client";

import React from 'react';
import type { DrawingAction, TextAction, ImageDrawingAction, ShapeAction, FreehandAction, LineAction, EraserAction } from '@/lib/types';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brush, Type, Image as ImageIcon, Minus, RectangleHorizontal, Circle as CircleIcon, Triangle as TriangleIcon, Eraser, Eye, EyeOff, Edit3, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from 'lucide-react';

interface HistorySidebarProps {
  history: DrawingAction[];
  onToggleVisibility: (actionId: string) => void;
  onDeleteItem: (actionId: string) => void; // For actual deletion, might be complex with undo/redo
  onSelectItemForEditing: (actionId: string, type: 'text' | 'shape' | 'image') => void; // Shape/image editing is placeholder
  className?: string;
}

const getActionIcon = (actionType: DrawingAction['type']) => {
  switch (actionType) {
    case 'freehand': return <Brush className="h-4 w-4 mr-2" />;
    case 'line': return <Minus className="h-4 w-4 mr-2" />;
    case 'rectangle': return <RectangleHorizontal className="h-4 w-4 mr-2" />;
    case 'circle': return <CircleIcon className="h-4 w-4 mr-2" />;
    case 'triangle': return <TriangleIcon className="h-4 w-4 mr-2" />;
    case 'text': return <Type className="h-4 w-4 mr-2" />;
    case 'image': return <ImageIcon className="h-4 w-4 mr-2" />;
    case 'eraser': return <Eraser className="h-4 w-4 mr-2" />;
    default: return <Brush className="h-4 w-4 mr-2" />;
  }
};

const getActionLabel = (action: DrawingAction): string => {
  switch (action.type) {
    case 'freehand': return `Freehand Stroke`;
    case 'line': return `Line`;
    case 'rectangle': return `Rectangle`;
    case 'circle': return `Circle`;
    case 'triangle': return `Triangle`;
    case 'text': 
      const textPreview = (action as TextAction).data.text.substring(0, 20);
      return `Text: ${textPreview}${textPreview.length < (action as TextAction).data.text.length ? '...' : ''}`;
    case 'image':
      const srcParts = (action as ImageDrawingAction).data.src.split('/');
      const filename = srcParts[srcParts.length -1].substring(0,20) || 'Image';
      return `Image: ${filename.split(',')[0]}`; // Basic name from data URI
    case 'eraser': return `Eraser Path`;
    default:
      const exhaustiveCheck: never = action; // Ensures all types are handled
      return 'Unknown Action';
  }
};

export function HistorySidebar({ history, onToggleVisibility, onDeleteItem, onSelectItemForEditing, className }: HistorySidebarProps) {
  if (!history || history.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No actions yet.</p>
        </CardContent>
      </Card>
    );
  }

  // Display history in reverse order (newest first)
  const reversedHistory = [...history].reverse();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-200px)] sm:h-[calc(100vh-280px)]"> {/* Adjust height as needed */}
          <ul className="p-2 space-y-1">
            {reversedHistory.map((action) => (
              <li
                key={action.id}
                className={`flex items-center justify-between p-2 rounded-md hover:bg-accent ${action.visible === false ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center truncate">
                  {getActionIcon(action.type)}
                  <span className="text-sm truncate" title={getActionLabel(action)}>{getActionLabel(action)}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onToggleVisibility(action.id)}>
                      {action.visible !== false ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                      <span>{action.visible !== false ? 'Hide' : 'Show'}</span>
                    </DropdownMenuItem>
                    {action.type === 'text' && (
                      <DropdownMenuItem onClick={() => onSelectItemForEditing(action.id, 'text')}>
                        <Edit3 className="mr-2 h-4 w-4" />
                        <span>Edit Text</span>
                      </DropdownMenuItem>
                    )}
                    {/* Placeholder for shape/image editing */}
                    {/* { (action.type === 'rectangle' || action.type === 'circle' || action.type === 'image') && (
                       <DropdownMenuItem onClick={() => onSelectItemForEditing(action.id, action.type)}>
                        <Edit3 className="mr-2 h-4 w-4" />
                        <span>Edit</span>
                      </DropdownMenuItem>
                    )} */}
                    <DropdownMenuItem onClick={() => onDeleteItem(action.id)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
