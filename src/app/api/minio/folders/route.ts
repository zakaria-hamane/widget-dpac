import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';
export const dynamic = 'force-dynamic';


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bucketName = searchParams.get('bucket') || process.env.MINIO_BUCKET || 'dpac';

    // Configuration MinIO
    const minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || '72.146.30.121',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || '',
      secretKey: process.env.MINIO_SECRET_KEY || '',
    });

    console.log(`🔍 Listing folders in bucket: ${bucketName}`);

    // Lister les objets du bucket avec délimiteur "/" pour obtenir les dossiers
    const stream = minioClient.listObjectsV2(bucketName, '', false, '/');
    
    const folders: string[] = [];
    
    // Écouter les événements du stream
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (obj) => {
        // Les "prefixes" sont les dossiers
        if (obj.prefix) {
          // Enlever le "/" final
          const folderName = obj.prefix.replace(/\/$/, '');
          if (folderName) {
            folders.push(folderName);
          }
        }
      });

      stream.on('error', (err) => {
        console.error('❌ Error listing folders:', err);
        reject(err);
      });

      stream.on('end', () => {
        console.log('✅ Folders listed successfully');
        resolve();
      });
    });

    console.log(`📁 Found ${folders.length} folders:`, folders);

    return NextResponse.json({
      success: true,
      bucket: bucketName,
      folders: folders.map(name => ({
        name,
        prefix: `${name}/`
      }))
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to list folders',
        details: error.message
      },
      { status: 500 }
    );
  }
}

