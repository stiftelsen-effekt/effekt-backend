const gulp = require('gulp')
const sass = require('gulp-sass')
const watch = require('gulp-watch')

gulp.task('style', function(done) {
    gulp.src('views/style/**/*.scss')
        .pipe(sass({
            errLogToConsole: true
        }))
        .pipe(gulp.dest('views/style/'))

    done()
})

gulp.task('watch', function(done) {
    gulp.watch('views/style/**/*.scss').on("change", (path, stats) => {
        gulp.series('style');
    })

    done()
})

gulp.task('default', gulp.series('style'))