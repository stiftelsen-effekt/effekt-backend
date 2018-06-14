const gulp = require('gulp')
const sass = require('gulp-sass')
const watch = require('gulp-watch')

gulp.task('style', function() {
    gulp.src('views/style/**/*.scss')
        .pipe(sass({
            errLogToConsole: true
        }))
        .pipe(gulp.dest('views/style/'))
})

gulp.task('default', ['style'])

gulp.task('watch', function() {
    gulp.watch('views/style/**/*.scss', ['style'])
})