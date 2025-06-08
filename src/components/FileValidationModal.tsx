import React from 'react';
import { X, AlertTriangle, FileX, Info } from 'lucide-react';
import { getAllowedTypesText } from '../utils/fileValidation';

interface FileValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: string;
  fileName: string;
  category: 'blocked' | 'unknown' | 'allowed';
}

export function FileValidationModal({ 
  isOpen, 
  onClose, 
  error, 
  fileName, 
  category 
}: FileValidationModalProps) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (category) {
      case 'blocked':
        return <AlertTriangle className="w-12 h-12 text-red-500" />;
      case 'unknown':
        return <FileX className="w-12 h-12 text-orange-500" />;
      default:
        return <Info className="w-12 h-12 text-blue-500" />;
    }
  };

  const getTitle = () => {
    switch (category) {
      case 'blocked':
        return 'File Blocked for Security';
      case 'unknown':
        return 'Unsupported File Type';
      default:
        return 'File Upload Error';
    }
  };

  const getDescription = () => {
    switch (category) {
      case 'blocked':
        return 'This file type is blocked for security reasons. Executable files and potentially harmful formats are not allowed.';
      case 'unknown':
        return 'This file type is not supported. Please choose a file from the allowed types below.';
      default:
        return 'There was an issue with your file upload. Please check the file size and type.';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            {getIcon()}
            <h2 className="text-xl font-bold text-gray-900">{getTitle()}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* File name */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">File:</div>
            <div className="font-medium text-gray-900 break-all">{fileName}</div>
          </div>

          {/* Error message */}
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">Error:</div>
            <div className="text-red-600 font-medium">{error}</div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <p className="text-gray-700">{getDescription()}</p>
          </div>

          {/* Allowed types */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Allowed File Types
            </h3>
            <div className="text-sm text-blue-800 whitespace-pre-line font-mono">
              {getAllowedTypesText()}
            </div>
          </div>

          {/* Size limits */}
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Size Limits</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Images: 50MB maximum</li>
              <li>• Documents & Archives: 100MB maximum</li>
              <li>• Videos: 100MB maximum</li>
              <li>• Audio: 50MB maximum</li>
              <li>• Code files: 10MB maximum</li>
            </ul>
          </div>

          {category === 'blocked' && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Security Notice
              </h3>
              <p className="text-sm text-red-800">
                Executable files (.exe, .bat, .cmd, etc.) and potentially harmful formats 
                are blocked to protect against malware and security threats.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}