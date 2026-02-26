pipeline {
    agent any
    
    environment {
        NODE_VERSION = '20'
        DEPLOY_PATH = '/opt/auscore'
        PM2_APP_NAME = 'auscore'
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo 'Pulling latest code...'
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo 'Installing dependencies...'
                sh '''
                    node --version
                    npm --version
                    npm install
                    cd server
                    npm install
                '''
            }
        }
        
        stage('Build Frontend') {
            steps {
                echo 'Building frontend...'
                sh 'npm run build'
            }
        }
        
        stage('Test') {
            steps {
                echo 'Running tests...'
                // 如果有测试，在这里运行
                // sh 'npm test'
            }
        }
        
        stage('Deploy') {
            steps {
                echo 'Deploying to server...'
                sh '''
                    # 备份当前版本
                    if [ -d ${DEPLOY_PATH} ]; then
                        cp -r ${DEPLOY_PATH} ${DEPLOY_PATH}.backup.$(date +%Y%m%d_%H%M%S)
                    fi
                    
                    # 复制文件到部署目录
                    mkdir -p ${DEPLOY_PATH}
                    cp -r dist ${DEPLOY_PATH}/
                    cp -r server ${DEPLOY_PATH}/
                    cp package.json ${DEPLOY_PATH}/
                    
                    # 重启服务
                    cd ${DEPLOY_PATH}/server
                    pm2 restart ${PM2_APP_NAME}-api || pm2 start index.js --name ${PM2_APP_NAME}-api
                    
                    cd ${DEPLOY_PATH}
                    pm2 restart ${PM2_APP_NAME}-frontend || pm2 start npm --name ${PM2_APP_NAME}-frontend -- run dev -- --host 0.0.0.0
                    
                    pm2 save
                '''
            }
        }
        
        stage('Health Check') {
            steps {
                echo 'Checking service health...'
                sh '''
                    sleep 5
                    pm2 list
                    curl -f http://localhost:13338/api/hostname || exit 1
                    curl -f http://localhost:13337 || exit 1
                '''
            }
        }
    }
    
    post {
        success {
            echo 'Deployment successful!'
            // 可以添加通知，比如发送邮件或 Slack 消息
        }
        failure {
            echo 'Deployment failed!'
            sh '''
                # 回滚到备份版本
                LATEST_BACKUP=$(ls -t ${DEPLOY_PATH}.backup.* 2>/dev/null | head -1)
                if [ -n "$LATEST_BACKUP" ]; then
                    echo "Rolling back to $LATEST_BACKUP"
                    rm -rf ${DEPLOY_PATH}
                    mv $LATEST_BACKUP ${DEPLOY_PATH}
                    pm2 restart all
                fi
            '''
        }
        always {
            echo 'Cleaning up...'
            sh '''
                # 只保留最近 3 个备份
                ls -t ${DEPLOY_PATH}.backup.* 2>/dev/null | tail -n +4 | xargs rm -rf
            '''
        }
    }
}
