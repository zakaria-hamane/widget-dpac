import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bucketName = searchParams.get('bucket') || process.env.MINIO_BUCKET || 'dpac';
    const folder = searchParams.get('folder');

    if (!folder) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Folder parameter is required',
          hint: 'Use ?bucket=dpac&folder=FolderName'
        },
        { status: 400 }
      );
    }

    // Configuration MinIO
    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || '72.146.30.121',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || '',
      secretKey: process.env.MINIO_SECRET_KEY || '',
    });

    console.log(`🔍 Listing files in bucket: ${bucketName}, folder: ${folder}`);

    // S'assurer que le folder se termine par "/"
    const prefix = folder.endsWith('/') ? folder : `${folder}/`;
    
    // Lister les objets du dossier (recursive = true pour tout le contenu)
    const stream = minioClient.listObjectsV2(bucketName, prefix, true);
    
    const files: any[] = [];
    
    // Écouter les événements du stream
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (obj) => {
        // Ignorer les "dossiers" (prefixes seulement)
        if (obj.name && !obj.name.endsWith('/')) {
          // Extraire juste le nom du fichier (sans le chemin complet)
          const fileName = obj.name.replace(prefix, '');
          
          files.push({
            name: fileName,
            fullPath: obj.name,
            size: obj.size,
            etag: obj.etag,
            lastModified: obj.lastModified
          });
        }
      });

      stream.on('error', (err) => {
        console.error('❌ Error listing files:', err);
        reject(err);
      });

      stream.on('end', () => {
        console.log('✅ Files listed successfully');
        resolve();
      });
    });

    console.log(`📄 Found ${files.length} files in folder "${folder}"`);

    return NextResponse.json({
      success: true,
      bucket: bucketName,
      folder,
      files
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to list files',
        details: error.message
      },
      { status: 500 }
    );
  }
}

