import { NextResponse } from 'next/server';
import * as Minio from 'minio';

export async function GET() {
  try {
    const endpoint = process.env.MINIO_ENDPOINT || '72.146.30.121';
    const port = parseInt(process.env.MINIO_PORT || '9000');
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const accessKey = process.env.MINIO_ACCESS_KEY || '';
    const secretKey = process.env.MINIO_SECRET_KEY || '';

    console.log('🔍 Testing MinIO connection...');
    console.log('📍 Endpoint:', endpoint);
    console.log('🔌 Port:', port);
    console.log('🔒 SSL:', useSSL);
    console.log('👤 Access Key:', accessKey ? '✅ Set' : '❌ Missing');
    console.log('🔑 Secret Key:', secretKey ? '✅ Set' : '❌ Missing');

    // Configuration MinIO depuis les variables d'environnement
    const minioClient = new Minio.Client({
      endPoint: endpoint,
      port: port,
      useSSL: useSSL,
      accessKey: accessKey,
      secretKey: secretKey,
    });
    
    // Test 1: Lister les buckets
    const buckets = await minioClient.listBuckets();
    
    console.log('✅ MinIO connection successful!');
    console.log('📦 Buckets found:', buckets.map(b => b.name));

    return NextResponse.json({
      success: true,
      message: 'MinIO connection successful',
      config: {
        endpoint,
        port,
        useSSL
      },
      buckets: buckets.map(b => ({
        name: b.name,
        creationDate: b.creationDate
      }))
    });

  } catch (error: any) {
    console.error('❌ MinIO connection error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to connect to MinIO',
        details: error.message,
        config: {
          endpoint: process.env.MINIO_ENDPOINT,
          port: process.env.MINIO_PORT,
          hasAccessKey: !!process.env.MINIO_ACCESS_KEY,
          hasSecretKey: !!process.env.MINIO_SECRET_KEY
        },
        hint: 'Check your .env.local credentials and port number'
      },
      { status: 500 }
    );
  }
}

