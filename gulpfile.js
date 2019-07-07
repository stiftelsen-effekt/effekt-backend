const gulp = require('gulp');
const sass = require('gulp-sass');

const stylesPath = './views/style/**/*.scss'

function styles() {
    return gulp.src(stylesPath)
        .pipe(sass().on('error', sass.logError))
        .pipe(gulp.dest('./views/style/'));
}

function watch() {
    //gulp.series('styles')
    return gulp.watch(stylesPath, gulp.series(styles))
}

exports.default = styles
exports.watch = watch