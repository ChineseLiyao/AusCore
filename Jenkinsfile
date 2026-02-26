pipeline {
    agent any
    
    environment {
        DEPLOY_PATH = '/opt/auscore'
        PM2_APP_NAME = 'auscore'
        PATH = "/usr/local/bin:${env.PATH}"
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo 'Pulling latest code...'
                checkout scm
            }
        }
        
        stage('Check Environment') {
            steps {
                echo 'Checking environment...'
                sh '''
                    which node || echo "Node.js not found in PATH"
                    which npm || echo "NPM not found in PATH"
                    which pm2 || echo "PM2 not found in PATH"
                '''
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo 'Installing dependencies...'
                sh '''
                    /usr/local/bin/node --version
                    /usr/local/bin/npm --version
                    /usr/local/bin/npm install
                    cd server
                    /usr/local/bin/npm install
                '''
            }
        }
        
        stage('Build Frontend') {
            steps {
                echo 'Building frontend...'
                sh '/usr/local/bin/npm run build'
            }
        }
        
        stage('Deploy') {
            steps {
                echo 'Deploying to server...'
                sh '''
                    echo "Creating backup..."
                    if [ -d ${DEPLOY_PATH} ]; then
                        cp -r ${DEPLOY_PATH} ${DEPLOY_PATH}.backup.$(date +%Y%m%d_%H%M%S) || true
                    fi
                    
                    echo "Copying files..."
                    mkdir -p ${DEPLOY_PATH}
                    cp -r dist ${DEPLOY_PATH}/ || true
                    cp -r server ${DEPLOY_PATH}/ || true
                    cp package.json ${DEPLOY_PATH}/ || true
                    
                    echo "Deployment files copied!"
                '''
            }
        }
        
        stage('Restart Services') {
            steps {
                echo 'Restarting PM2 services...'
                sh '''
                    cd ${DEPLOY_PATH}/server
                    /usr/local/bin/pm2 restart ${PM2_APP_NAME}-api || /usr/local/bin/pm2 start index.js --name ${PM2_APP_NAME}-api
                    
                    cd ${DEPLOY_PATH}
                    /usr/local/bin/pm2 restart ${PM2_APP_NAME}-frontend || /usr/local/bin/pm2 start npm --name ${PM2_APP_NAME}-frontend -- run dev -- --host 0.0.0.0
                    
                    /usr/local/bin/pm2 save
                    /usr/local/bin/pm2 list
                '''
            }
        }
    }
    
    post {
        success {
            echo '✅ Deployment successful!'
        }
        failure {
            echo '❌ Deployment failed! Check console output for details.'
        }
        always {
            echo 'Cleaning up old backups...'
            sh '''
                ls -t ${DEPLOY_PATH}.backup.* 2>/dev/null | tail -n +4 | xargs rm -rf || true
            '''
        }
    }
}
