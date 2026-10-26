precision highp float;
varying highp vec2 textureCoordinate;
uniform highp int isForSurfaceView;
uniform highp vec4 bgColor;
uniform highp vec3 firstColor;
uniform highp vec3 secondColor;
uniform highp float cropMinX;
uniform highp float cropMaxX;
uniform highp float cropMinY;
uniform highp float cropMaxY;
uniform highp float aspectRatio;
uniform highp float duration;
uniform highp float time;

const highp float pi = 3.1415926;

highp mat2 rotationMatrix(highp float angle)
{
    return mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
}

highp float ellipse(highp vec2 ellipseFragCoord, highp float ellipseA, highp float ellipseB, highp float ellipseAlpha)
{
    ellipseA = ellipseA * 1.2;
    ellipseB = ellipseB * 1.2;
    highp float ellipseDistance = pow(ellipseFragCoord.x, 2.0) / pow(ellipseA, 2.0) + pow(ellipseFragCoord.y, 2.0) / pow(ellipseB, 2.0);
    ellipseDistance = clamp(ellipseDistance, 0.0, 1.0);
    highp float ellipseDepth = 0.5 * pow(2.0 * ((ellipseDistance < 0.5) ? ellipseDistance : (1.0 - ellipseDistance)), 1.5);
    ellipseDepth = (ellipseDistance < 0.5) ? (1.0 - ellipseDepth) : ellipseDepth;
    ellipseDepth = clamp(ellipseDepth, 0.0, 1.0);
    ellipseDepth = pow(ellipseDepth, 3.0);
    return ellipseDepth * ellipseAlpha;
}

highp float ellipseDepth_1(highp vec2 fragCoordinate, highp float progressTime, highp float rotateTime)
{
    highp float angle = - pi * 2.0 * rotateTime;
    highp vec2 aspectRatioCoordinate = vec2(fragCoordinate.x, fragCoordinate.y / aspectRatio);
    highp vec2 anchorPoint = vec2(- 0.53, - 1.09 / aspectRatio);
    highp float anchorRadius = 0.3;
    highp vec2 ellipseCoordinate = anchorPoint + anchorRadius * vec2(cos(angle), sin(angle));
    highp vec2 ellipseFragCoord = rotationMatrix(angle) * (aspectRatioCoordinate - ellipseCoordinate);
    highp float ellipseA = 1.32 - 0.20 * progressTime;
    highp float ellipseB = 1.32 + 0.22 * progressTime;
    highp float ellipseAlpha = 0.45;
    return ellipse(ellipseFragCoord, ellipseA, ellipseB, ellipseAlpha);
}

highp float ellipseDepth_2(highp vec2 fragCoordinate, highp float progressTime)
{
    highp vec2 aspectRatioCoordinate = vec2(fragCoordinate.x, fragCoordinate.y / aspectRatio);
    highp vec2 ellipseCoordinate = vec2(0.74 - 0.74 * progressTime, - 1.073 / aspectRatio);
    highp vec2 ellipseFragCoord = aspectRatioCoordinate - ellipseCoordinate;
    highp float ellipseA = 0.98 + 1.06 * progressTime;
    highp float ellipseB = 0.98 + 0.42 * progressTime;
    highp float ellipseAlpha = 0.4;
    return ellipse(ellipseFragCoord, ellipseA, ellipseB, ellipseAlpha);
}

highp vec4 addBgColor(highp vec4 color) {
    return vec4(color.rgb + bgColor.rgb * (1.0 - color.a), 1.0);
}

void main()
{
    highp vec2 cropCoordinate = vec2(cropMinX + textureCoordinate.x * (cropMaxX - cropMinX), cropMinY + textureCoordinate.y * (cropMaxY - cropMinY));
    highp vec2 fragCoordinate = (cropCoordinate * 2.0 - vec2(1.0, 1.0)) * vec2(1.0, - 1.0);
    highp float progressTime = fract(time / duration);
    highp float rotateTime = progressTime;
    progressTime = (progressTime < 0.5) ? (2.0 * progressTime) : (1.0 - 2.0 * (progressTime - 0.5));
    highp float ellipseDepth_1 = ellipseDepth_1(fragCoordinate, progressTime, rotateTime);
    highp float ellipseDepth_2 = ellipseDepth_2(fragCoordinate, progressTime);
    highp vec4 ellipseColor_1 = vec4(vec3(firstColor), 1.0);
    highp vec4 ellipseColor_2 = vec4(vec3(secondColor), 1.0);
    highp vec4 color = vec4(0.0);
    color = mix(color, ellipseColor_2, ellipseDepth_2);
    color = mix(color, ellipseColor_1, ellipseDepth_1);

    if (isForSurfaceView == 1) {
        gl_FragColor = addBgColor(color);
    } else {
        gl_FragColor = color;
    }
}
