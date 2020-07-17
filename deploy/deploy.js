const path = require('path');
const archiver = require('archiver');
const fs = require('fs');
const node_ssh = require('node-ssh');
const ssh = new node_ssh();
const srcPath = path.resolve(__dirname, '../dist');
const configs = require('./config');
const StreamZip = require('node-stream-zip');

console.log('开始压缩dist目录...');
startZip();

//压缩dist目录为dist.zip
function startZip() {
  var archive = archiver('zip', {
    zlib: { level: 5 } //递归扫描最多5层
  }).on('error', function (err) {
    throw err;//压缩过程中如果有错误则抛出
  });

  var output = fs.createWriteStream(__dirname + '/dist.zip')
    .on('close', function (err) {
      /*压缩结束时会触发close事件，然后才能开始上传，
        否则会上传一个内容不全且无法使用的zip包*/
      if (err) {
        console.log('关闭archiver异常:', err);
        return;
      }
      console.log('已生成zip包');
      // console.log('开始上传dist.zip至远程机器...');
      // uploadFile();

      moveToServer()
    });

  archive.pipe(output);//典型的node流用法
  archive.directory(srcPath, 'dist');//将srcPach路径对应的内容添加到zip包中,并重命名
  archive.finalize();
}

// 将dist目录移到服务器指定位置
function moveToServer() {
  const zipFile = path.join(__dirname, '../../serverDemo/public/dist.zip')
  const unzipToPath = path.join(__dirname, '../../serverDemo/public')
  fs.readFile(path.join(__dirname, './dist.zip'), (err, data) => {
    if (err) {
      throw err
    }
    console.log('dist.zip文件读取成功')
    console.log('开始写入到 ' + path.join(__dirname, '../public') + '...')
    fs.writeFile(zipFile, data, err => {
      if (err) {
        throw err
      }
      console.log('dist.zip文件写入成功')
      let zip = new StreamZip({
        file: zipFile,
        storeEntries: true
      })

      zip.on('err', err => {
        throw err
      })
      zip.on('ready', () => {
        console.log('zip准备完成，开始解压...')
        rmdirSync(unzipToPath + '/dist', err => {
          if (err) {
            console.log('删除dist目录失败', err)
            zip.close()
            process.exit(0)
          }
          console.log('删除dist目录成功');
        })
        zip.extract(null, unzipToPath, err => {
          if (err) {
            console.log('解压失败', err)
          }
          console.log('解压成功')
          zip.close()
          process.exit(0)
        });
      })
    })
  })
}

//将dist目录上传至正式环境
function uploadFile() {
  ssh.connect({ //configs存放的是连接远程机器的信息
    host: configs.host,
    username: configs.user,
    password: configs.password,
    port: 22 //SSH连接默认在22端口
  }).then(function () {
    //上传网站的发布包至configs中配置的远程服务器的指定地址
    ssh.putFile(__dirname + '/dist.zip', configs.path).then(function (status) {
      console.log('上传文件成功');
      console.log('开始执行远端脚本');
      startRemoteShell();//上传成功后触发远端脚本
    }).catch(err => {
      console.log('文件传输异常:', err);
      process.exit(0);
    });
  }).catch(err => {
    console.log('ssh连接失败:', err);
    process.exit(0);
  });
}

//执行远端部署脚本
function startRemoteShell() {
  //在服务器上cwd配置的路径下执行sh deploy.sh脚本来实现发布
  ssh.execCommand('sh deploy.sh', { cwd: '/usr/bin/XXXXX' }).then(function (result) {
    console.log('远程STDOUT输出: ' + result.stdout)
    console.log('远程STDERR输出: ' + result.stderr)
    if (!result.stderr) {
      console.log('发布成功!');
      process.exit(0);
    }
  });
}


var rmdirSync = (function () {
  function iterator(url, dirs) {
    var stat = fs.statSync(url);
    if (stat.isDirectory()) {
      dirs.unshift(url);//收集目录
      inner(url, dirs);
    } else if (stat.isFile()) {
      fs.unlinkSync(url);//直接删除文件
    }
  }
  function inner(path, dirs) {
    var arr = fs.readdirSync(path);
    for (var i = 0, el; el = arr[i++];) {
      iterator(path + "/" + el, dirs);
    }
  }
  return function (dir, cb) {
    cb = cb || function () { };
    var dirs = [];

    try {
      iterator(dir, dirs);
      for (var i = 0, el; el = dirs[i++];) {
        fs.rmdirSync(el);//一次性删除所有收集到的目录
      }
      cb()
    } catch (e) {//如果文件或目录本来就不存在，fs.statSync会报错，不过我们还是当成没有异常发生
      e.code === "ENOENT" ? cb() : cb(e);
    }
  }
})();